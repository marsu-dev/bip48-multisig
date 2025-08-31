// test/multisig-bip48.spec.ts
import * as bs58check from 'bs58check'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChangeChain, buildBip48P2wshAddress } from '../src/index'

// --- Signet tpub vectors (account-level, BIP-48 …/2') ---
const TPUBS = [
  'tpubDFErwxEibF1d8NwR7wG9KUz94F8JAFJJPz5GQFeGVcz6ssgEr5nWsPkpbcpn6KPcDPgYrSofnya2kbm196He327iWCRK9nVkxuz8ZjT9cXG',
  'tpubDF6CqZd1yujcP79jyEvuC4f5rMNByCqgomZhtfgV6LprZGoxxmzH5LuDPvybL8rzCzJpXynsSARzmN9SoYdLKpLq5ZGwED6vE4mXpLS6gDH',
  'tpubDFhQCkPCwwcaMPrmzrbqM4SKcea9Uj1sXnpx3Q9ezZhsxn9cP8Csbt1cw39yA3YmqFNU2UNMXUaWD1vmU5f5TdvB2ZMW3hvTYqjKLmtVztt',
]

// Expected Signet outputs for m=2, /0/0 and /0/1
const EXPECT = {
  addr00: 'tb1qyytc8lvrzvq70k0fkftx6p9gnmyl3dcanc2j9r90t3s3tk6rxx0sx3fhvw',
  wit00:
    '5221028b1f8ada790c1ce051178d6ea5fd523fa8a1201883f9e606cccfd0e9065730fb21035a9e74801ecd93623f229dc19e9d295bc86f9148c8504f295ceae8ffc712a8ef2103aca5d4469551a248c35703f8396cd96150c21e4a1561810b4d2fde75122b545053ae',
  addr01: 'tb1qhtfz0678rc45y4weujeutn9autlhmldrjsj536y3a3wr4zagh8nq5d4vxe',
  wit01:
    '522102b6a13b8be750bdd2d6b94a858ad7c333225c84d287e8029d13e88869d351b5082102b703984c0b275a2351f82cc10dc2c40d7febf66fc9e54307bc3db673f9b764f12103fa88ddcbe90b71649961db9a7f58777808d1cfe8922a8d93ab691af775ed937f53ae',
}

// --- Helpers (for negative/mixed-network tests) ---
function swapVersion(ext: string, toVersionHex: string): string {
  const payload = bs58check.decode(ext)
  const body = payload.slice(4)
  const ver = Buffer.allocUnsafe(4)
  ver.writeUInt32BE(parseInt(toVersionHex, 16), 0)
  return bs58check.encode(Buffer.concat([ver, body]))
}

// make a synthetic mainnet Zpub from a tpub (for mixed-network error test)
function tpubToZpubForTest(tpub: string): string {
  // SLIP-132 mainnet multisig P2WSH Zpub = 0x02aa7ed3
  return swapVersion(tpub, '02aa7ed3')
}

describe('buildBip48P2wshAddress (Signet/Testnet-like)', () => {
  it('derives exact known /0/0 and /0/1 for m=2 (Signet forced)', () => {
    const a00 = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.External,
      index: 0,
      network: 'signet',
    })
    expect(a00.address).toEqual(EXPECT.addr00)
    expect(a00.witnessScriptHex).toEqual(EXPECT.wit00)
    expect(a00.address.startsWith('tb1')).toBe(true)
    expect(a00.descriptorTemplate).toMatch(/^wsh\(sortedmulti\(2,/)
    expect(a00.descriptorConcret).toMatch(/^wsh\(sortedmulti\(2,.*\/0\/0\)\)$/)

    const a01 = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.External,
      index: 1,
      network: 'signet',
    })
    expect(a01.address).toEqual(EXPECT.addr01)
    expect(a01.witnessScriptHex).toEqual(EXPECT.wit01)
    expect(a01.address.startsWith('tb1')).toBe(true)
    expect(a01.descriptorConcret).toMatch(/\/0\/1\)\)$/)
  })

  it('also succeeds if network omitted (auto-detected as testnet-like → same tb1 outputs)', () => {
    const a00 = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.External,
      index: 0,
    })
    expect(a00.address).toEqual(EXPECT.addr00)
    expect(a00.witnessScriptHex).toEqual(EXPECT.wit00)
  })

  it('produces valid change branch addresses (/1/0)', () => {
    const a10 = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.Internal,
      index: 0,
      network: 'signet',
    })
    expect(a10.address.startsWith('tb1')).toBe(true)
    expect(typeof a10.witnessScriptHex).toBe('string')
    expect(a10.witnessScriptHex.length).toBeGreaterThan(60)
    expect(a10.descriptorConcret).toMatch(/\/1\/0\)\)$/)
  })
})

describe('strictBip48 warnings (single-sig prefixes)', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    spy.mockRestore()
  })

  it('emits a warning when single-sig prefixes (zpub/ypub/vpub/upub) are supplied with strictBip48=true', () => {
    const fakeVpub = swapVersion(TPUBS[0], '045f1cf6') // single-sig vpub
    buildBip48P2wshAddress({
      m: 2,
      xpubs: [fakeVpub, TPUBS[1]],
      change: ChangeChain.External,
      index: 0,
      network: 'signet',
      strictBip48: true,
    })
    expect(spy).toHaveBeenCalled()
  })

  it('does not warn if strictBip48=false', () => {
    const fakeVpub = swapVersion(TPUBS[0], '045f1cf6')
    buildBip48P2wshAddress({
      m: 2,
      xpubs: [fakeVpub, TPUBS[1]],
      change: ChangeChain.External,
      index: 0,
      network: 'signet',
      strictBip48: false,
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('errors & guards', () => {
  it('throws for invalid m (0, >n) and too many cosigners (>15)', () => {
    expect(() =>
      buildBip48P2wshAddress({
        m: 0,
        xpubs: TPUBS,
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow(/Invalid threshold/i)

    expect(() =>
      buildBip48P2wshAddress({
        m: 4,
        xpubs: TPUBS,
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow(/Invalid threshold/i)

    const many = Array.from({ length: 16 }, () => TPUBS[0])
    expect(() =>
      buildBip48P2wshAddress({
        m: 2,
        xpubs: many,
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow(/Too many cosigners/i)
  })

  it('throws when mixing mainnet and testnet-like families', () => {
    const mixed = [tpubToZpubForTest(TPUBS[0]), TPUBS[1]] // mainnet Zpub + testnet tpub
    expect(() =>
      buildBip48P2wshAddress({
        m: 2,
        xpubs: mixed,
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow(/Mixed networks/i)
  })

  it('does not throw if network is explicitly "signet" with testnet-family keys (Signet uses testnet HRP/version)', () => {
    const res = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS, // testnet-like family
      change: ChangeChain.External,
      index: 0,
      network: 'signet',
    })
    expect(res.address).toEqual(EXPECT.addr00)
  })
})

describe('descriptors format', () => {
  it('returns both template and concrete descriptors with neutral versions (xpub/tpub) and proper paths', () => {
    const r = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.External,
      index: 7,
      network: 'signet',
    })
    expect(r.descriptorTemplate).toMatch(
      /^wsh\(sortedmulti\(2,(xpub|tpub)[^,]*\/0\/\*,(xpub|tpub)[^,]*\/0\/\*,(xpub|tpub)[^)]*\/0\/\*\)\)$/
    )
    expect(r.descriptorConcret).toMatch(
      /^wsh\(sortedmulti\(2,(xpub|tpub)[^,]*\/0\/7,(xpub|tpub)[^,]*\/0\/7,(xpub|tpub)[^)]*\/0\/7\)\)$/
    )
  })

  it('validates descriptor output format for different parameters', () => {
    const result = buildBip48P2wshAddress({
      m: 2,
      xpubs: TPUBS,
      change: ChangeChain.External,
      index: 0,
      network: 'signet',
    })
    expect(result.descriptorTemplate).toMatch(/^wsh\(sortedmulti\(2,/)
    expect(result.descriptorConcret).toMatch(/\/0\/0\)\)$/)
  })
})

describe('malformed inputs', () => {
  it('throws for malformed xpubs (invalid base58/prefix)', () => {
    const invalidXpubs = ['notAValidXpub', 'xpubInvalidBase58!!', '']
    expect(() =>
      buildBip48P2wshAddress({
        m: 1,
        xpubs: [invalidXpubs[0]],
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow()
    expect(() =>
      buildBip48P2wshAddress({
        m: 1,
        xpubs: [invalidXpubs[1]],
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow()
    expect(() =>
      buildBip48P2wshAddress({
        m: 1,
        xpubs: [invalidXpubs[2]],
        change: ChangeChain.External,
        index: 0,
        network: 'signet',
      })
    ).toThrow()
  })
})
