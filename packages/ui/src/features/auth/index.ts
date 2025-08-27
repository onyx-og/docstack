import { createSlice, createAsyncThunk, createReducer, nanoid, createAction } from '@reduxjs/toolkit';
import { encryptStringWithPublicKey, importPublicKey  } from 'utils/crypto';

export interface AuthState {
  isAuthenticated: boolean;
  isAnonymous: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isAnonymous: false,
};

const encryptString = async (string: string) => {
  const publicKeyPem = process.env.PSW_PUBLIC_KEY;

  if (publicKeyPem === undefined) {
    throw new Error("Public key not found");
  }

  // Convert the public key to a CryptoKey
  const publicKey = await importPublicKey(publicKeyPem);

  // Encrypt string with the public key
  const encryptedString = await encryptStringWithPublicKey(publicKey, string);
  const encryptedStringBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedString)));

  return encryptedStringBase64;
}

const doLogin = async (data: {
  username: string;
  password: string;
  serverURL: string;
}) => {
  const encryptedStringBase64 = await encryptString(data.password);

  const response = await fetch(`${data.serverURL}/login`, {
    method: "POST",
    body: JSON.stringify({
      username: data.username,
      password: encryptedStringBase64
    }),
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

export const skipLogin = createAction("skipLogin");

export const login = createAsyncThunk('login', 
  async ( data: any, thunkApi) => {
    let response = await doLogin(data);
    if (response.success) {
      return response;
    } else {
      return thunkApi.rejectWithValue(response);
    }
  }
);

export const logout = createAsyncThunk('logout', 
  async ( data: any, thunkApi) => {
    // TODO
  }
);

const auth = createReducer(initialState, builder => { builder
  .addCase(login.fulfilled, (state, action) => {
    state.isAuthenticated = true;
  })
  .addCase(login.rejected, (state, action) => {
      // TODO
      console.error(action.error);
  })
  .addCase(logout.fulfilled, (state, action) => {
      state.isAuthenticated = false;
      state.isAnonymous = false;
  })
  .addCase(logout.rejected, (state, action) => {
      // TODO
      console.error(action.error);
  })
  .addCase(skipLogin, (state, action) => {
    state.isAnonymous = true;
  })
});

export default auth;