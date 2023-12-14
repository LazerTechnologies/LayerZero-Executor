## lz

This is a WIP repository containing an alternative Executor node implementation targetting the LayerZero V2 protocol.

Additionally, this repository contains tooling (Hardhat config and contract deployment tasks) required to deploy the LayerZero V2 contracts to local test networks.

This project is structured as a monorepo managed by `pnpm` and `turborepo`.

The `@lz/executor` app package hosts the offchain Executor implementation.

The `@lz/sdk` library package hosts the Typechain-generated bindings, deployment scripts, integration tests and contracts.

### Executor Design

The Executor is implemented as a Typescript program using Typechain bindings targetting ethers `v6`.

The Executor is currently configured with environment variables: block number (`BLOCK_NUMBER`), source and destination RPC URLs (`SRC_RPC_URL` and `DST_RPC_URL` respectively), source and destination `EndpointV2` contract addressess (`SRC_ENDPOINT_CONTRACT_ADDRESS` and `DST_ENDPOINT_CONTRACT_ADDRESS` respectively) and a destination private key (`DST_PRIVATE_KEY`).

There is a currently a single instantiation of the `Executor` class (which represents support for a single network -> network), however numerous instantiations could be implemented with minimal configuration.

### Integration Testing

Run integration tests by bringing up local networks within a `docker-compose` environment, then execute tests against local networks with the following commands:

```
$ pnpm test:up
$ pnpm test
$ pnpm test:down
```

### Development

While developing the Executor, it is useful to test against local networks which can be provisioned with the following commands:

```
$ pnpm dev:up
$ pnpm dev:down
```

### Next Steps

- [ ] Implement `commitVerification` logic for `Verifiable` packets.
- [ ] Implement logging with `pino`.
- [ ] Improve handling of failure cases.
- [ ] Unit tests guaranteeing the behaviour of the Executor given various packet scenarios.
