// Singleton loader for the libpcapng WASM engine.
import createLibpcapng, { type LibpcapngModule } from "./wasm/libpcapng";

let modPromise: Promise<LibpcapngModule> | null = null;

export function getEngine(): Promise<LibpcapngModule> {
  if (!modPromise) modPromise = createLibpcapng();
  return modPromise;
}

export type {
  Field,
  Summary,
  PosaInfo,
  PosaLoadResult,
  Conversation,
  Endpoint,
  HierarchyNode,
  Stream,
  StreamPacket,
  StreamTimeline,
  ExtractedObject,
  LibpcapngModule,
} from "./wasm/libpcapng";
