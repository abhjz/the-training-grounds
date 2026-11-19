# Contributing to The Training Grounds

Thanks for helping make a better track designer for FPV pilots.

## Reporting a bug or asking for a feature

[Open an issue](https://github.com/abhjz/the-training-grounds/issues/new/choose) and pick a template. For bugs, the device, the app version and a screenshot or short recording are the most useful things you can send. If the problem only happens on one track, attach its track JSON file (Save & Export Track → Track JSON File).

## Working on the code

```bash
npm install
npm run dev      # web version at http://localhost:3000
npm run lint     # type check
npm test         # unit tests (race line and gate maneuvers)
npm run build    # production build
```

Every push and pull request runs the type check, the tests and the build on GitHub. Please make sure they pass locally first.

Some guidelines:

- **Keep pull requests small and focused.** One fix or one feature per PR is easiest to review.
- **Track maths needs a test.** If you change anything in `src/utils/raceLine.ts` or `src/utils/trackMath.ts`, add or update a test in `src/utils/__tests__/`.
- **Saved tracks must keep working.** Pilots have tracks saved from older versions; new fields should be optional, and old files should still open.
- **Scenery is decoration.** 3D scenery for a look must ignore clicks, respect reduced motion, and be marked `userData.noExport` so it stays out of 3D exports.
- **No trademarks or brand names** in looks, themes or assets.

## License

The project is under the [PolyForm Noncommercial 1.0.0](LICENSE.md) license. By sending a contribution, you agree it can be distributed under the same license.
