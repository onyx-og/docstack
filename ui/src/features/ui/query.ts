import { createAction  } from '@reduxjs/toolkit';

const action = createAction<string>('setQuery');

export default action;