import { createAsyncThunk, createReducer } from '@reduxjs/toolkit';
import { saveState as saveStateLocal } from 'utils/pouchdb';
const doTestRequest = async () => {
    // Include credentials in development mode (different port)
    var credentialsConfig: RequestCredentials = process.env.NODE_ENV === "development" ? 'include' : 'same-origin';
    console.log("doTestRequest - credentialsConfig", credentialsConfig);
    const response = await fetch("http://localhost:5000/api/test", {
        method: "GET",
        mode: 'cors',
        credentials: credentialsConfig,
        // credentials: credentialsConfig,
        headers: {
            'Content-Type': 'application/json',
        },
    });
    return response.json();
}

export const testRequest = createAsyncThunk('testRequest', async (data: any, thunkApi) => {
    const response = await doTestRequest();
    return response;
})

export const saveState = createAsyncThunk('saveState', async (data: boolean, thunkApi) => {
    const state = thunkApi.getState();
    console.log("saveStateAction - Got state", state);
    await saveStateLocal(state);
})

const initialState = {
    test: 'test'
}

const reducer = createReducer(initialState, builder => { builder
    .addCase(testRequest.fulfilled, (state, action) => {
        console.log(action.payload);
    })
    .addCase(saveState.fulfilled, (state, action) => {
        
    })
})

export default reducer;