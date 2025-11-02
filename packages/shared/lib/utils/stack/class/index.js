import { z } from "zod";
const CLASS_TYPE = "class";
const SUPERCLASS_TYPE = "superclass";
const CLASS_TYPES = [CLASS_TYPE, SUPERCLASS_TYPE];
class Class extends EventTarget {
    constructor() {
        super();
        this.attributes = {};
        this.schema = {};
        this.schemaZOD = z.object({});
        this.state = 'idle';
        this.triggers = [];
    }
}
export default Class;
//# sourceMappingURL=index.js.map