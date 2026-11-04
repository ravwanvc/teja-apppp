import {env} from '../../../lib/runtime-env.js';
export function GET(){return Response.json({key:env.GOOGLE_MAPS_BROWSER_KEY||''});}
