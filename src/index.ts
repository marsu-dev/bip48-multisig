// multisig-bip48.ts — with Signet support
// Dependencies (ESM):
//   npm i bitcoinjs-lib bip32 bs58check tiny-secp256k1
//
// Purpose:
//   - Build native SegWit P2WSH multisig addresses following BIP-48 (purpose 48′).
//   - Support SLIP-132 extended key prefixes (xpub/ypub/zpub for singlesig,
//     Ypub/Zpub for multisig on mainnet; tpub/upub/vpub/Upub/Vpub for testnet/signet).
//   - Normalize any SLIP-132 flavor to a neutral account-level xpub (or tpub)
//     so that we can derive non-hardened children /change/index for each cosigner.
//   - Produce output descriptors using sortedmulti (BIP-67).
//
// Notes:
//   • BIP-48 derivation path shape for multisig accounts (per cosigner key):
//       m / 48' / coin_type' / account' / script_type'
//       where script_type' == 2' (native P2WSH) or 1' (P2WSH-P2SH).
//   • Signet reuses testnet’s human-readable parts (bech32 “tb”) and version bytes,
//     so key prefixes look testnet-like. The caller may force `network: 'signet'`
//     when needed for address/network consistency.
//   • Keys are BIP-67 sorted before script construction to ensure deterministic ordering.
//
// Caveats:
//   - Provided extended public keys must be account-level at m/48'/…'/(2'|1').
//   - Mixed networks (mainnet + testnet) are rejected.
//   - `strictBip48` warns if a key looks single-sig (ypub/zpub/upub/vpub).
//
// -----------------------------------------------------------------------------
import type { BIP32API, BIP32Interface } from 'bip32'
import { type Network, initEccLib, networks, payments } from 'bitcoinjs-lib'
import * as bs58check from 'bs58check'
import { Buffer } from 'node:buffer'
import * as ecc from 'tiny-secp256k1'

// bitcoinjs-lib requires an ECC backend
initEccLib(ecc)

// -----------------------------------------------------------------------------
// Safe dynamic load of bip32 factory (no `any`)
// -----------------------------------------------------------------------------

function getProp(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>)[key] : undefined
}

type GenericFactory = (impl: unknown) => BIP32API

async function loadBip32(): Promise<BIP32API> {
  const mod = (await import('bip32')) as unknown
  const d = getProp(mod, 'default')
  const dd = typeof d === 'object' && d ? getProp(d, 'default') : undefined
  const dFactory = typeof d === 'object' && d ? getProp(d, 'BIP32Factory') : undefined

  const candidates: unknown[] = [
    d, // default export (most builds)
    getProp(mod, 'BIP32Factory'),
    mod,
    dd, // default.default (some bundlers)
    dFactory,
  ]

  const factory = candidates.find(c => typeof c === 'function') as unknown

  if (typeof factory !== 'function') {
    const keys =
      typeof mod === 'object' && mod !== null ? Object.keys(mod as Record<string, unknown>) : []
    throw new TypeError(`bip32 export not callable. Got keys: [${keys.join(', ')}]`)
  }

  // Call factory with tiny-secp256k1 impl (typed as unknown, narrowed by GenericFactory)
  return (factory as GenericFactory)(ecc)
}

const bip32: BIP32API = await loadBip32()

// -----------------------------------------------------------------------------
// Networks
// -----------------------------------------------------------------------------

export const signetNetwork: Network = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 }, // tpub/tprv
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
}

// -----------------------------------------------------------------------------
// SLIP-132 version maps & helpers (typed, no `any`)
// -----------------------------------------------------------------------------

const VERSIONS = {
  mainnet: {
    xpub: 0x0488b21e,
    ypub: 0x049d7cb2,
    zpub: 0x04b24746,
    Ypub: 0x0295b43f,
    Zpub: 0x02aa7ed3,
  },
  testnet: {
    tpub: 0x043587cf,
    upub: 0x044a5262,
    vpub: 0x045f1cf6,
    Upub: 0x024289ef,
    Vpub: 0x02575483,
  },
} as const

type MainnetPrefix = keyof typeof VERSIONS.mainnet
type TestnetPrefix = keyof typeof VERSIONS.testnet
type KnownPrefix = MainnetPrefix | TestnetPrefix
type Net = 'mainnet' | 'testnet' | 'signet'

function isMainnetPrefix(p: string): p is MainnetPrefix {
  return (Object.keys(VERSIONS.mainnet) as string[]).includes(p)
}
function isTestnetPrefix(p: string): p is TestnetPrefix {
  return (Object.keys(VERSIONS.testnet) as string[]).includes(p)
}

function detectPrefix(key: string): KnownPrefix | null {
  const p = key.slice(0, 4)
  if (isMainnetPrefix(p) || isTestnetPrefix(p)) return p
  return null
}

function prefixNetwork(prefix: KnownPrefix): Exclude<Net, 'signet'> {
  return isMainnetPrefix(prefix) ? 'mainnet' : 'testnet'
}

function replaceVersion(extKey: string, toVersion: number): string {
  const data = bs58check.decode(extKey)
  if (data.length < 4) throw new Error('Extended key too short')
  const out = Buffer.from(data)
  out.writeUInt32BE(toVersion, 0)
  return bs58check.encode(out)
}

function normalizeToNeutralPub(extKey: string): {
  neutral: string
  network: Exclude<Net, 'signet'>
} {
  const pref = detectPrefix(extKey)
  if (!pref) throw new Error('Unknown extended key prefix')
  const net = prefixNetwork(pref)
  const neutralVersion = net === 'mainnet' ? VERSIONS.mainnet.xpub : VERSIONS.testnet.tpub
  const alreadyNeutral =
    (net === 'mainnet' && pref === 'xpub') || (net === 'testnet' && pref === 'tpub')
  return {
    neutral: alreadyNeutral ? extKey : replaceVersion(extKey, neutralVersion),
    network: net,
  }
}

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export enum CoinType {
  Mainnet = 0,
  Testnet = 1,
}

export enum ScriptType {
  P2WSH_P2SH = 1,
  P2WSH = 2,
}

export enum ChangeChain {
  External = 0,
  Internal = 1,
}

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type MultisigRequest = {
  m: number
  xpubs: string[]
  change: ChangeChain
  index: number
  network?: Net
  strictBip48?: boolean
}

export type MultisigResult = {
  address: string
  witnessScriptHex: string
  redeemScriptHex?: string
  descriptorTemplate: string
  descriptorConcret: string
}

// -----------------------------------------------------------------------------
// Single address builder
// -----------------------------------------------------------------------------

export function buildBip48P2wshAddress(req: MultisigRequest): MultisigResult {
  const { m, xpubs, change, index, strictBip48 = true } = req
  if (!Number.isInteger(m) || m < 1 || m > xpubs.length) throw new Error('Invalid threshold m')
  if (xpubs.length > 15) throw new Error('Too many cosigners')

  const normalized = xpubs.map(normalizeToNeutralPub)
  const detectedNet = normalized[0].network
  for (const n of normalized)
    if (n.network !== detectedNet) throw new Error('Mixed networks in keys')

  const chosenNet: Net = req.network ?? detectedNet
  const network: Network =
    chosenNet === 'mainnet'
      ? networks.bitcoin
      : chosenNet === 'signet'
        ? signetNetwork
        : networks.testnet

  if (strictBip48) {
    for (const raw of xpubs) {
      const p = detectPrefix(raw)
      if (!p) continue
      const singleSigPrefixes: KnownPrefix[] = ['zpub', 'ypub', 'vpub', 'upub'] as const
      if ((singleSigPrefixes as readonly string[]).includes(p)) {
        console.warn(
          `[WARN] ${raw.slice(0, 10)}… looks single-sig (${p}). For BIP-48 multisig, use Zpub/Ypub (or xpub/tpub) at m/48'/…'/(2'|1').`
        )
      }
    }
  }

  const childPubkeys: Buffer[] = normalized.map(({ neutral }) => {
    const node: BIP32Interface = bip32.fromBase58(neutral, network)
    const child = node.derive(change).derive(index)
    return Buffer.from(child.publicKey)
  })

  const sortedPubkeys = childPubkeys.slice().sort(Buffer.compare)
  const p2ms = payments.p2ms({ m, pubkeys: sortedPubkeys, network })
  const p2wsh = payments.p2wsh({ redeem: p2ms, network })
  if (!p2wsh.address || !p2wsh.redeem?.output) throw new Error('Failed to build P2WSH address')

  const templateKeys = normalized.map(({ neutral }) => `${neutral}/0/*`)
  const descriptorTemplate = `wsh(sortedmulti(${m},${templateKeys.join(',')}))`

  const concretKeys = normalized.map(({ neutral }) => `${neutral}/${change}/${index}`)
  const descriptorConcret = `wsh(sortedmulti(${m},${concretKeys.join(',')}))`

  return {
    address: p2wsh.address,
    witnessScriptHex: p2wsh.redeem.output.toString('hex'),
    redeemScriptHex: undefined,
    descriptorTemplate,
    descriptorConcret,
  }
}

// -----------------------------------------------------------------------------
// Bulk derivation
// -----------------------------------------------------------------------------

export type DeriveParams = {
  m: number
  xpubs: string[]
  change: ChangeChain
  start: number
  count: number
  account?: number
  scriptType?: ScriptType
  coinType?: CoinType
  network?: 'mainnet' | 'testnet' | 'signet'
  strictBip48?: boolean
}

export type DerivedResult = MultisigResult & {
  index: number
  path: string
}

export function deriveBip48Addresses(params: DeriveParams): DerivedResult[] {
  const {
    start,
    count,
    account = 0,
    scriptType = ScriptType.P2WSH,
    coinType = CoinType.Testnet,
    ...base
  } = params

  const results: DerivedResult[] = []

  for (let i = 0; i < count; i++) {
    const index = start + i
    const res = buildBip48P2wshAddress({
      ...base,
      index,
    })

    const path = `m/48'/${coinType}'/${account}'/${scriptType}'/${base.change}/${index}`
    results.push({ ...res, index, path })
  }

  return results
}
