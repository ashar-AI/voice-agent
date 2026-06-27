import { Firestore, type DocumentData } from "@google-cloud/firestore";
import type {
  AlertRecord,
  CallSession,
  CallSummary,
  CaregiverBriefing,
  DashboardSnapshot,
  ElderProfile,
  MemoryItem,
  RiskState,
  TranscriptTurn
} from "@voice-agent/contracts";
import {
  DashboardSnapshotSchema
} from "@voice-agent/contracts";
import { z } from "zod";
import {
  DEMO_ELDER_ID,
  baseMemories,
  createInitialRiskState,
  demoProfile
} from "./demoData.js";

export const StateRepositoryModeSchema = z.enum(["memory", "firestore"]);
export type StateRepositoryMode = z.infer<typeof StateRepositoryModeSchema>;

const CareVoiceStateSchema = DashboardSnapshotSchema.omit({
  updatedAt: true
});

export type CareVoiceState = z.infer<typeof CareVoiceStateSchema>;

export interface CareVoiceStateRepository {
  readonly mode: StateRepositoryMode;
  loadState(elderId: string): Promise<CareVoiceState>;
  saveState(state: CareVoiceState): Promise<void>;
  resetState(elderId: string): Promise<CareVoiceState>;
  getElderProfile(elderId: string): Promise<ElderProfile>;
  listMemories(elderId: string): Promise<MemoryItem[]>;
  getCallSession(elderId: string): Promise<CallSession | undefined>;
  listTranscript(elderId: string): Promise<TranscriptTurn[]>;
  getRiskState(elderId: string): Promise<RiskState>;
  listAlerts(elderId: string): Promise<AlertRecord[]>;
  getLatestSummary(elderId: string): Promise<CallSummary | undefined>;
  getLatestBriefing(elderId: string): Promise<CaregiverBriefing | undefined>;
}

export type StateRepositoryConfig = {
  mode: StateRepositoryMode;
  firestoreProjectId?: string;
  firestoreCollection: string;
};

export function readStateRepositoryConfig(
  env: NodeJS.ProcessEnv = process.env
): StateRepositoryConfig {
  const configuredMode = env.STATE_REPOSITORY ?? env.STATE_STORE ?? "memory";
  const mode = StateRepositoryModeSchema.parse(configuredMode);

  return {
    mode,
    firestoreProjectId: env.GOOGLE_CLOUD_PROJECT,
    firestoreCollection: env.FIRESTORE_STATE_COLLECTION ?? "carevoice_states"
  };
}

export function createStateRepository(
  config: StateRepositoryConfig = readStateRepositoryConfig()
): CareVoiceStateRepository {
  if (config.mode === "memory") {
    return new MemoryCareVoiceStateRepository();
  }

  return new FirestoreCareVoiceStateRepository({
    projectId: config.firestoreProjectId,
    collection: config.firestoreCollection
  });
}

export class MemoryCareVoiceStateRepository implements CareVoiceStateRepository {
  readonly mode = "memory" as const;
  private readonly states = new Map<string, CareVoiceState>();

  constructor(initialStates: CareVoiceState[] = []) {
    for (const state of initialStates) {
      this.states.set(state.profile.elderId, cloneState(state));
    }
  }

  async loadState(elderId: string): Promise<CareVoiceState> {
    const existing = this.states.get(elderId);
    if (existing) {
      return cloneState(existing);
    }

    const state = createInitialCareVoiceState(elderId);
    this.states.set(elderId, cloneState(state));
    return state;
  }

  async saveState(state: CareVoiceState): Promise<void> {
    this.states.set(state.profile.elderId, cloneState(state));
  }

  async resetState(elderId: string): Promise<CareVoiceState> {
    const state = createInitialCareVoiceState(elderId);
    this.states.set(elderId, cloneState(state));
    return state;
  }

  async getElderProfile(elderId: string): Promise<ElderProfile> {
    return (await this.loadState(elderId)).profile;
  }

  async listMemories(elderId: string): Promise<MemoryItem[]> {
    return (await this.loadState(elderId)).memories;
  }

  async getCallSession(elderId: string): Promise<CallSession | undefined> {
    return (await this.loadState(elderId)).session;
  }

  async listTranscript(elderId: string): Promise<TranscriptTurn[]> {
    return (await this.loadState(elderId)).transcript;
  }

  async getRiskState(elderId: string): Promise<RiskState> {
    return (await this.loadState(elderId)).riskState;
  }

  async listAlerts(elderId: string): Promise<AlertRecord[]> {
    return (await this.loadState(elderId)).alerts;
  }

  async getLatestSummary(elderId: string): Promise<CallSummary | undefined> {
    return (await this.loadState(elderId)).latestSummary;
  }

  async getLatestBriefing(elderId: string): Promise<CaregiverBriefing | undefined> {
    return (await this.loadState(elderId)).latestBriefing;
  }
}

export class FirestoreCareVoiceStateRepository implements CareVoiceStateRepository {
  readonly mode = "firestore" as const;
  private readonly firestore: Firestore;
  private readonly collection: string;

  constructor(options: {
    projectId?: string;
    collection?: string;
    firestore?: Firestore;
  } = {}) {
    this.firestore =
      options.firestore ??
      new Firestore({
        projectId: options.projectId,
        ignoreUndefinedProperties: true
      });
    this.collection = options.collection ?? "carevoice_states";
  }

  async loadState(elderId: string): Promise<CareVoiceState> {
    const snapshot = await this.document(elderId).get();
    if (!snapshot.exists) {
      return this.resetState(elderId);
    }

    return CareVoiceStateSchema.parse(snapshot.data());
  }

  async saveState(state: CareVoiceState): Promise<void> {
    await this.document(state.profile.elderId).set({
      ...removeUndefined(cloneState(state)),
      updatedAt: new Date().toISOString()
    });
  }

  async resetState(elderId: string): Promise<CareVoiceState> {
    const state = createInitialCareVoiceState(elderId);
    await this.saveState(state);
    return state;
  }

  async getElderProfile(elderId: string): Promise<ElderProfile> {
    return (await this.loadState(elderId)).profile;
  }

  async listMemories(elderId: string): Promise<MemoryItem[]> {
    return (await this.loadState(elderId)).memories;
  }

  async getCallSession(elderId: string): Promise<CallSession | undefined> {
    return (await this.loadState(elderId)).session;
  }

  async listTranscript(elderId: string): Promise<TranscriptTurn[]> {
    return (await this.loadState(elderId)).transcript;
  }

  async getRiskState(elderId: string): Promise<RiskState> {
    return (await this.loadState(elderId)).riskState;
  }

  async listAlerts(elderId: string): Promise<AlertRecord[]> {
    return (await this.loadState(elderId)).alerts;
  }

  async getLatestSummary(elderId: string): Promise<CallSummary | undefined> {
    return (await this.loadState(elderId)).latestSummary;
  }

  async getLatestBriefing(elderId: string): Promise<CaregiverBriefing | undefined> {
    return (await this.loadState(elderId)).latestBriefing;
  }

  private document(elderId: string) {
    return this.firestore.collection(this.collection).doc(elderId);
  }
}

export function createInitialCareVoiceState(elderId = DEMO_ELDER_ID): CareVoiceState {
  if (elderId !== DEMO_ELDER_ID) {
    throw new Error(`Unknown elder: ${elderId}`);
  }

  return {
    profile: clone(demoProfile),
    memories: clone(baseMemories),
    transcript: [],
    riskState: createInitialRiskState(),
    alerts: []
  };
}

export function stateToSnapshot(state: CareVoiceState): DashboardSnapshot {
  return {
    ...cloneState(state),
    updatedAt: new Date().toISOString()
  };
}

function cloneState(state: CareVoiceState): CareVoiceState {
  return CareVoiceStateSchema.parse(clone(state));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function removeUndefined(value: unknown): DocumentData {
  if (Array.isArray(value)) {
    return value.map(removeUndefined) as DocumentData;
  }

  if (typeof value !== "object" || value === null) {
    return value as DocumentData;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .map(([key, nestedValue]) => [key, removeUndefined(nestedValue)])
  );
}
