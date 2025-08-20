import getLogger from "./utils/logger";
import Surfer from './utils/dbManager/Surfer';
import Class from './utils/dbManager/Class';
import Attribute from './utils/dbManager/Attribute';
declare const couchsurfer: () => import("express-serve-static-core").Express;
export { Surfer, Class, Attribute, getLogger };
export { couchsurfer };
