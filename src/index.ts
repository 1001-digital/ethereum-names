export { createEthereumNames } from './client.js'
export { detectSystem, detectSystems, profileUrl } from './routing.js'
export {
  DEFAULT_GNS_CONTRACT,
  DEFAULT_REGISTRIES,
  DEFAULT_WNS_CONTRACT,
} from './name-service.js'
export { RESERVED_SUFFIXES } from './systems.js'
export type {
  CollisionResolver,
  CollisionStrategy,
  EthereumNames,
  EthereumNamesConfig,
  MatchStatus,
  NameMatch,
  NameRegistry,
  NameSystem,
  ProfileUrl,
  RegistryId,
  ResolutionStatus,
  ResolvedName,
  ReverseNames,
  SystemDescriptor,
  SystemId,
} from './types.js'
