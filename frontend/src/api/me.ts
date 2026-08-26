import { api } from './client';
import type { Me } from '../types';

export function getMe() {
  return api.get<Me>('/me');
}
