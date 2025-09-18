import { createAction, createReducer } from "@reduxjs/toolkit"

export const setStackName = createAction<string>("stack/setName");

export type StackState = {
    name: string;
}
const initState: StackState = {
    name: ""
}

const stack = createReducer(initState, builder => builder
    .addCase(setStackName, (state, action) => {
        debugger;
        state.name = action.payload;
    })
);

export default stack;