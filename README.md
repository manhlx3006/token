# Introduction

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)
[![Build Status](https://api.travis-ci.com/KyberNetwork/kyber_reserves_sc.svg?branch=master&status=passed)](https://travis-ci.com/github/KyberNetwork/kyber_reserves_sc)


TeaToken and Crowdsale contracts.

## Package Manager
We use `yarn` as the package manager. You may use `npm` and `npx` instead, but commands in bash scripts may have to be changed accordingly.


## Setup
1. Clone this repo
2. `yarn install`


## Compilation with Buidler
`yarn compile` to compile contracts for all solidity versions or `./compile.sh`


## Contract Deployment / Interactions

For interactions or contract deployments on public testnets / mainnet, create a `.env` file specifying your private key and infura api key, with the following format:

```
PRIVATE_KEY=0x****************************************************************
INFURA_API_KEY=********************************
```

## Testing with Buidler
1. If contracts have not been compiled, run `yarn compile` or `./compile.sh`. This step can be skipped subsequently.
2. Run `yarn test` or `./test.sh`
3. Use `./test.sh -f` for running a specific test file.

### Example Commands
- `yarn test` (Runs all tests)
- `./test.sh -f ./tests/xxx.js`

### Example
`yarn hardhat test --no-compile ./test/xxx.js`

### Coverage with `buidler-coverage`
- Run `./coverage.sh` for coverage on files
