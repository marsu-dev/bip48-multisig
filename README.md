# bip48-multisig

TypeScript/JavaScript library for deriving **BIP-48 multisig (P2WSH)** addresses and output descriptors.  
Supports **mainnet, testnet, and signet**, with full awareness of **SLIP-132 extended key prefixes** (`xpub`/`tpub`, `Ypub`/`Zpub`, `Upub`/`Vpub`, etc.).

This package focuses on **deterministic multisig wallets** as standardized in [BIP-48](https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki).  
It is designed for developers building **watch-only multisig coordinators**, hardware wallet integrations, or multisig explorers that require:

- Correct handling of account-level extended keys derived at `m/48'/coin_type'/account'/script_type'`.
- Construction of **native SegWit P2WSH multisig scripts** with deterministic pubkey ordering ([BIP-67](https://github.com/bitcoin/bips/blob/master/bip-0067.mediawiki)).
- **Output descriptors** in both template form (with wildcards) and concrete form (specific change/index paths) for compatibility with `bitcoind`, `bitcoin-cli`, or PSBT-based signing flows.
- Seamless interop with hardware wallet standards (Ledger, Trezor, Coldcard, Keystone, etc.) which all rely on BIP-48 paths for multisig.

Unlike generic HD-wallet derivation libraries, `bip48-multisig` is **specialized for multisig**. It normalizes any [SLIP-132](https://github.com/satoshilabs/slips/blob/master/slip-0132.md) flavored xpubs (`Zpub`, `Ypub`, `Upub`, etc.) back to neutral account-level `xpub`/`tpub`, ensuring that keys from different wallets can be combined safely without ambiguity.

---

## Features

- Build **native SegWit P2WSH multisig** addresses using BIP-48 (`m/48'` paths).
- Accept **SLIP-132 extended key flavors** and normalize them (e.g., Zpub → xpub).
- Support for **mainnet**, **testnet**, and **signet** networks.
- Enforce **BIP-67 sortedmulti** ordering for deterministic scripts.
- Generate both:
  - **Template descriptors** (with `/0/*` placeholders).
  - **Concrete descriptors** (with `/change/index` applied).

---

## Use cases

- Build **watch-only multisig wallets** (e.g. for hardware wallet cosigning).
- Generate **output descriptors** compatible with `bitcoind`/`bitcoin-cli`.
- Verify cosigner keys and derive **deterministic addresses** for external/change branches.
- Educational/demo usage for understanding **multisig key path structure**.

---

## Installation

```sh
npm install bip48-multisig
```

---

## Usage

### Single address

```ts
import { ChangeChain, buildBip48P2wshAddress } from 'bip48-multisig'

const res = buildBip48P2wshAddress({
  m: 2,
  xpubs: [
    'tpubDFErwxEibF1d8NwR7wG9KUz94F8JAFJJPz5GQFeGVcz6ssgEr5nWsPkpbcpn6KPcDPgYrSofnya2kbm196He327iWCRK9nVkxuz8ZjT9cXG',
    'tpubDF6CqZd1yujcP79jyEvuC4f5rMNByCqgomZhtfgV6LprZGoxxmzH5LuDPvybL8rzCzJpXynsSARzmN9SoYdLKpLq5ZGwED6vE4mXpLS6gDH',
  ],
  change: ChangeChain.External,
  index: 0,
  network: 'signet',
})

console.log(res.address)
console.log(res.descriptorConcret)
```

---

### Derive multiple addresses

```ts
import { ChangeChain, ScriptType, deriveBip48Addresses } from 'bip48-multisig'

const addresses = deriveBip48Addresses({
  m: 2,
  xpubs: [
    'tpubDFErwxEibF1d8NwR7wG9KUz94F8JAFJJPz5GQFeGVcz6ssgEr5nWsPkpbcpn6KPcDPgYrSofnya2kbm196He327iWCRK9nVkxuz8ZjT9cXG',
    'tpubDF6CqZd1yujcP79jyEvuC4f5rMNByCqgomZhtfgV6LprZGoxxmzH5LuDPvybL8rzCzJpXynsSARzmN9SoYdLKpLq5ZGwED6vE4mXpLS6gDH',
    'tpubDFhQCkPCwwcaMPrmzrbqM4SKcea9Uj1sXnpx3Q9ezZhsxn9cP8Csbt1cw39yA3YmqFNU2UNMXUaWD1vmU5f5TdvB2ZMW3hvTYqjKLmtVztt',
  ],
  network: 'signet',
  account: 0,
  scriptType: ScriptType.P2WSH,
  change: ChangeChain.External,
  start: 0,
  count: 5,
})

addresses.forEach(({ index, path, address }) => {
  console.log({ index, path, address })
})
```

## Security

- This package derives **public data only** (no private key material).
- Always back up your **seeds** (per cosigner) and **descriptors** (for watch-only recovery).
- Verify addresses on hardware devices when signing.

---

## BIP References

- https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki
- https://github.com/bitcoin/bips/blob/master/bip-0067.mediawiki
- https://github.com/satoshilabs/slips/blob/master/slip-0132.md
- https://github.com/satoshilabs/slips/blob/master/slip-0044.md
