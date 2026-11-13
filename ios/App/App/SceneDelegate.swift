import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Cold start from "Open in Training Grounds" / the share sheet
        for context in connectionOptions.urlContexts {
            TrackFileInbox.shared.receive(context.url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        for context in URLContexts {
            TrackFileInbox.shared.receive(context.url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Capacitor's web view controller, with the app's own TrackFile plugin registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrackFilePlugin())
    }
}

/// Holds track files opened with / shared to the app until the TrackFile plugin is ready.
final class TrackFileInbox {
    static let shared = TrackFileInbox()
    private var pending: [URL] = []
    private weak var plugin: TrackFilePlugin?

    func receive(_ url: URL) {
        guard url.isFileURL else { return }
        if let plugin = plugin {
            plugin.deliver(url)
        } else {
            pending.append(url)
        }
    }

    func attach(_ plugin: TrackFilePlugin) {
        self.plugin = plugin
        let queued = pending
        pending = []
        queued.forEach { plugin.deliver($0) }
    }
}

/// Hands the text of a received track file (.json) to the web app as a "trackFile" event.
/// Web side: src/utils/incomingTrackFile.ts (same event as the Android version).
@objc(TrackFilePlugin)
public class TrackFilePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrackFilePlugin"
    public let jsName = "TrackFile"
    public let pluginMethods: [CAPPluginMethod] = []

    private let maxBytes = 10 * 1024 * 1024

    override public func load() {
        TrackFileInbox.shared.attach(self)
    }

    func deliver(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        var payload: [String: Any] = ["name": url.lastPathComponent]
        do {
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > maxBytes {
                payload["error"] = "Could not read the file: it is too large"
            } else {
                payload["text"] = try String(contentsOf: url, encoding: .utf8)
            }
        } catch {
            payload["error"] = "Could not read the file: \(error.localizedDescription)"
        }
        // Retained until the web app adds its listener, so cold starts work too
        notifyListeners("trackFile", data: payload, retainUntilConsumed: true)
    }
}
