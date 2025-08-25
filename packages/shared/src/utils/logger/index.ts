import clientLogger from "../../../../client/src/utils/logger";
// import {serverLogger} from "../../../../../server/src/utils/logger";

const getLogger = () => {
  if (typeof window !== 'undefined') {
    // Running in a browser
    return clientLogger;
  } else if (false) {
    // Running in Node.js
    return (require("../../../../../server/src/utils/logger"));
  }
}

export default getLogger;