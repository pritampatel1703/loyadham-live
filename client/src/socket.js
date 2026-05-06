import { io } from 'socket.io-client';
const URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');
export const productionSocket = io(`${URL}/production`, { autoConnect: false, transports: ['websocket','polling'] });
export const deviceSocket = io(`${URL}/devices`, { autoConnect: false, transports: ['websocket','polling'] });
export const signalingSocket = io(`${URL}/signaling`, { autoConnect: false, transports: ['websocket','polling'] });
