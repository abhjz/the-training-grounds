import { SavedTrack } from '../types';
import mainUaeFpv from './mainUaeFpv.json';

/**
 * Built-in layouts for built-in grounds. Main UAE FPV is the UAE FPV Community's main site, modelled from
 * a drone GPS survey (pitch, sand pit, track, obstacles, buildings, trees). Rebuilt with the script in the
 * community's "Claude outputs" folder; positions are field metres, no GPS is stored here.
 */
export const MAIN_UAE_FPV_TRACK = mainUaeFpv as unknown as SavedTrack;
