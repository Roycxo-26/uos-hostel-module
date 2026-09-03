import { api } from './client';
import type { FacilityBooking, ProgrammeParticipant, ProgrammeType, ResidenceProgramme } from '../types';

// --- Facility bookings -----------------------------------------------------

export async function requestBooking(input: { commonAreaId: string; purpose: string; startAt: string; endAt: string; attendeeCount?: number }) {
  const { booking } = await api.post<{ booking: FacilityBooking }>('/residence-life/bookings', input);
  return booking;
}

export async function listBookings(filters: { status?: string; commonAreaId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { bookings } = await api.get<{ bookings: FacilityBooking[] }>(`/residence-life/bookings${params ? `?${params}` : ''}`);
  return bookings;
}

export async function getBooking(id: string) {
  const { booking } = await api.get<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}`);
  return booking;
}

export async function decideBooking(id: string, decision: 'approved' | 'rejected', reason: string) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/decide`, { decision, reason });
  return booking;
}

export async function checkInBooking(id: string) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/check-in`, {});
  return booking;
}

export async function completeBooking(id: string, attendeeCount?: number) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/complete`, { attendeeCount });
  return booking;
}

export async function cancelBooking(id: string, reason: string) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/cancel`, { reason });
  return booking;
}

export async function recordDamageIncident(id: string, reference: string) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/damage-incident`, { reference });
  return booking;
}

export async function closeBooking(id: string) {
  const { booking } = await api.post<{ booking: FacilityBooking }>(`/residence-life/bookings/${id}/close`, {});
  return booking;
}

// --- Residence-life programmes ----------------------------------------------

export async function proposeProgramme(input: {
  programmeType: ProgrammeType;
  targetScopeType: 'hostel' | 'floor';
  targetScopeId: string;
  organiserUserId?: string;
  scheduledAt: string;
  location?: string;
  facilityBookingId?: string;
  capacity?: number;
  registrationRequired?: boolean;
  accessibilityNeeds?: string;
  consentRequired?: boolean;
  incidentSafetyPlan?: string;
  costBudgetReference?: string;
}) {
  const { programme } = await api.post<{ programme: ResidenceProgramme }>('/residence-life/programmes', input);
  return programme;
}

export async function listProgrammes(filters: { status?: string; targetScopeType?: string; targetScopeId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { programmes } = await api.get<{ programmes: ResidenceProgramme[] }>(`/residence-life/programmes${params ? `?${params}` : ''}`);
  return programmes;
}

export async function getProgramme(id: string) {
  return api.get<ResidenceProgramme>(`/residence-life/programmes/${id}`);
}

export async function decideProgramme(id: string, decision: 'approved' | 'rejected', reason: string) {
  const { programme } = await api.post<{ programme: ResidenceProgramme }>(`/residence-life/programmes/${id}/decide`, { decision, reason });
  return programme;
}

export async function startProgramme(id: string) {
  const { programme } = await api.post<{ programme: ResidenceProgramme }>(`/residence-life/programmes/${id}/start`, {});
  return programme;
}

export async function completeProgramme(id: string, outcomeNotes?: string, feedbackSummary?: string) {
  const { programme } = await api.post<{ programme: ResidenceProgramme }>(`/residence-life/programmes/${id}/complete`, { outcomeNotes, feedbackSummary });
  return programme;
}

export async function cancelProgramme(id: string, reason: string) {
  const { programme } = await api.post<{ programme: ResidenceProgramme }>(`/residence-life/programmes/${id}/cancel`, { reason });
  return programme;
}

export async function registerForProgramme(id: string) {
  const { participant } = await api.post<{ participant: ProgrammeParticipant }>(`/residence-life/programmes/${id}/register`, {});
  return participant;
}

export async function markAttendance(id: string, studentId: string, attended: boolean, participationNotes?: string) {
  const { participant } = await api.post<{ participant: ProgrammeParticipant }>(`/residence-life/programmes/${id}/attendance`, { studentId, attended, participationNotes });
  return participant;
}
