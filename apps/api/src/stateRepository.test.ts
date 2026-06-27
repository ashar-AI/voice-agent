import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ELDER_ID } from "./demoData.js";
import {
  createInitialCareVoiceState,
  createStateRepository,
  FirestoreCareVoiceStateRepository,
  MemoryCareVoiceStateRepository,
  readStateRepositoryConfig
} from "./stateRepository.js";

test("state repository config defaults to memory mode", () => {
  const config = readStateRepositoryConfig({});

  assert.equal(config.mode, "memory");
  assert.equal(config.firestoreCollection, "carevoice_states");
});

test("state repository config selects Firestore mode from STATE_REPOSITORY", () => {
  const config = readStateRepositoryConfig({
    STATE_REPOSITORY: "firestore",
    GOOGLE_CLOUD_PROJECT: "carevoice-demo",
    FIRESTORE_STATE_COLLECTION: "demo_state"
  });

  assert.equal(config.mode, "firestore");
  assert.equal(config.firestoreProjectId, "carevoice-demo");
  assert.equal(config.firestoreCollection, "demo_state");
  assert.equal(createStateRepository(config).mode, "firestore");
});

test("state repository config supports legacy STATE_STORE alias", () => {
  const config = readStateRepositoryConfig({
    STATE_STORE: "firestore"
  });

  assert.equal(config.mode, "firestore");
});

test("memory repository persists saved state across loads", async () => {
  const repository = new MemoryCareVoiceStateRepository();
  const state = await repository.loadState(DEMO_ELDER_ID);
  const savedMemory = {
    id: "mem_test",
    elderId: DEMO_ELDER_ID,
    category: "social" as const,
    text: "Daughter visited in the afternoon.",
    observedAt: "2026-06-27T02:00:00.000Z",
    importance: "medium" as const
  };

  await repository.saveState({
    ...state,
    memories: [savedMemory, ...state.memories],
    transcript: [
      {
        id: "turn_test",
        speaker: "system",
        textJa: "repository test",
        timestamp: "2026-06-27T02:01:00.000Z"
      }
    ]
  });

  const loaded = await repository.loadState(DEMO_ELDER_ID);

  assert.equal(loaded.memories[0]?.id, savedMemory.id);
  assert.equal(loaded.transcript[0]?.id, "turn_test");
});

test("memory repository returns defensive copies", async () => {
  const repository = new MemoryCareVoiceStateRepository([
    createInitialCareVoiceState(DEMO_ELDER_ID)
  ]);
  const firstLoad = await repository.loadState(DEMO_ELDER_ID);
  firstLoad.memories.length = 0;

  const secondLoad = await repository.loadState(DEMO_ELDER_ID);

  assert.equal(secondLoad.memories.length, 3);
});

test("firestore repository can be constructed without network calls", () => {
  const repository = new FirestoreCareVoiceStateRepository({
    projectId: "carevoice-demo",
    collection: "demo_state"
  });

  assert.equal(repository.mode, "firestore");
});
