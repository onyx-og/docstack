import { createSlice, createAsyncThunk, createReducer, nanoid } from '@reduxjs/toolkit';
import { encryptStringWithPublicKey, importPublicKey  } from 'utils/crypto';

export interface AuthState {
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
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
}) => {
  const encryptedStringBase64 = await encryptString(data.password);

  const response = await fetch("http://localhost:5000/login", {
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
  })
  .addCase(logout.rejected, (state, action) => {
      // TODO
      console.error(action.error);
  })
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state) => {
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.isAuthenticated = false;
    },
  },
});

export default auth;