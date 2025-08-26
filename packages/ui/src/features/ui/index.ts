import { createReducer } from '@reduxjs/toolkit';
import setQuery from './query'

export interface UIState {
    query: string | undefined;
}

const initalState = {
    query: '',
} as UIState;

const reducer = createReducer(initalState, builder => { builder
    .addCase(setQuery, (state, action) =>{
        state.query = action.payload;
    })
})

export default reducer;
export { setQuery };