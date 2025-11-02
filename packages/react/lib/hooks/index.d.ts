import { Document } from '../../../shared/src/types';
export declare const useFind: (stack: string, query: {
    selector: {
        [key: string]: string | number;
    };
    fields?: string[];
}, sort?: any, limit?: number) => {
    docs: Document[];
    loading: boolean;
    error: null;
};
export declare const useClassCreate: () => void;
