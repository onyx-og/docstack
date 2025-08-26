export declare const docArray: any[];
export declare const maxChanges = 5;
export declare const changeLimit = 60000;
declare const replicateChanges: (docs: any, timer: any) => Promise<void>;
export default replicateChanges;
