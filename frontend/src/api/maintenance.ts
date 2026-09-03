import { api } from './client';
import type {
  CleanlinessAreaType,
  CleanlinessInspection,
  HousekeepingTask,
  HousekeepingTaskType,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceTicket,
  RoomReadiness,
} from '../types';

// --- Tickets -----------------------------------------------------------------

export async function reportTicket(input: {
  roomId?: string;
  locationNote?: string;
  category: MaintenanceCategory;
  description: string;
  priority?: MaintenancePriority;
  evidencePhotoUrl?: string;
}) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>('/maintenance/tickets', input);
  return ticket;
}

export async function listTickets(filters: { status?: string; roomId?: string; raisedBy?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { tickets } = await api.get<{ tickets: MaintenanceTicket[] }>(`/maintenance/tickets${params ? `?${params}` : ''}`);
  return tickets;
}

export async function getTicket(id: string) {
  const { ticket } = await api.get<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}`);
  return ticket;
}

export async function verifyTicket(id: string, decision: 'approved' | 'returned' | 'rejected', reason: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/verify`, { decision, reason });
  return ticket;
}

export async function assignTicket(id: string, input: { assignedToUserId?: string; assignedToProvider?: string; manualExternalReference?: string; dueDate?: string }) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/assign`, input);
  return ticket;
}

export async function startTicketWork(id: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/start`, {});
  return ticket;
}

export async function resolveTicket(id: string, resolutionNotes: string, resolutionEvidenceUrl?: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/resolve`, { resolutionNotes, resolutionEvidenceUrl });
  return ticket;
}

export async function confirmTicketResolution(id: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/confirm`, {});
  return ticket;
}

export async function reopenTicket(id: string, reason: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/reopen`, { reason });
  return ticket;
}

export async function cancelTicket(id: string, reason: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/cancel`, { reason });
  return ticket;
}

export async function linkDuplicateTicket(id: string, duplicateOfTicketId: string) {
  const { ticket } = await api.post<{ ticket: MaintenanceTicket }>(`/maintenance/tickets/${id}/link-duplicate`, { duplicateOfTicketId });
  return ticket;
}

// --- Housekeeping --------------------------------------------------------------

export async function scheduleHousekeepingTask(input: {
  scopeType: 'room' | 'floor' | 'hostel';
  scopeId: string;
  taskType: HousekeepingTaskType;
  scheduledDate: string;
  assignedToUserId?: string;
  preferredTime?: string;
  requestRoomAccess?: boolean;
}) {
  const { task } = await api.post<{ task: HousekeepingTask }>('/maintenance/housekeeping', input);
  return task;
}

export async function listHousekeepingTasks(filters: { status?: string; scopeType?: string; scopeId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { tasks } = await api.get<{ tasks: HousekeepingTask[] }>(`/maintenance/housekeeping${params ? `?${params}` : ''}`);
  return tasks;
}

export async function updateHousekeepingChecklist(id: string, key: string, completed: boolean, notes?: string) {
  const { task } = await api.post<{ task: HousekeepingTask }>(`/maintenance/housekeeping/${id}/checklist`, { key, completed, notes });
  return task;
}

export async function completeHousekeepingTask(id: string, consumableRequestReference?: string) {
  const { task } = await api.post<{ task: HousekeepingTask }>(`/maintenance/housekeeping/${id}/complete`, { consumableRequestReference });
  return task;
}

export async function markHousekeepingMissed(id: string, reason: string) {
  const { task } = await api.post<{ task: HousekeepingTask }>(`/maintenance/housekeeping/${id}/missed`, { reason });
  return task;
}

export async function createReworkTask(id: string, scheduledDate: string, assignedToUserId?: string) {
  const { task } = await api.post<{ task: HousekeepingTask }>(`/maintenance/housekeeping/${id}/rework`, { scheduledDate, assignedToUserId });
  return task;
}

// --- Cleanliness inspection ------------------------------------------------

export async function recordCleanlinessInspection(input: {
  areaType: CleanlinessAreaType;
  scopeId: string;
  housekeepingTaskId?: string;
  cleanlinessScore: number;
  wasteSegregationOk?: boolean;
  prohibitedAccumulationFlag?: boolean;
  safetyHazardFlag?: boolean;
  maintenanceDefectNoted?: boolean;
  maintenanceDefectNotes?: string;
  correctionDeadline?: string;
}) {
  const { inspection } = await api.post<{ inspection: CleanlinessInspection }>('/maintenance/inspections', input);
  return inspection;
}

export async function listCleanlinessInspections(filters: { areaType?: string; scopeId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { inspections } = await api.get<{ inspections: CleanlinessInspection[] }>(`/maintenance/inspections${params ? `?${params}` : ''}`);
  return inspections;
}

export async function getCleanlinessInspection(id: string) {
  const { inspection } = await api.get<{ inspection: CleanlinessInspection }>(`/maintenance/inspections/${id}`);
  return inspection;
}

export async function addResidentComment(id: string, comment: string) {
  const { inspection } = await api.post<{ inspection: CleanlinessInspection }>(`/maintenance/inspections/${id}/comment`, { comment });
  return inspection;
}

export async function appealCleanlinessInspection(id: string, reason: string) {
  const { inspection } = await api.post<{ inspection: CleanlinessInspection }>(`/maintenance/inspections/${id}/appeal`, { reason });
  return inspection;
}

export async function decideCleanlinessAppeal(id: string, outcome: 'upheld' | 'overturned', reason: string) {
  const { inspection } = await api.post<{ inspection: CleanlinessInspection }>(`/maintenance/inspections/${id}/decide-appeal`, { outcome, reason });
  return inspection;
}

// --- Room readiness ----------------------------------------------------------

export async function getRoomReadiness(roomId: string) {
  return api.get<RoomReadiness>(`/maintenance/room-readiness/${roomId}`);
}
