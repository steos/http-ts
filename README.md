## http-ts

This repo only exists to demo the approach we took at [Paperboard](https://paperboard.app) in building our http stack.

The code has been extracted from the paperboard monorepo.
It is not a consumable library and we don't intend to do any further development in this repo at this time.
It only exists for the curious who are interested in the code.

Feel free to peruse the source and adapt it to your own needs, or fork it and turn it into a usable library.

The code is published under the terms of the BSD (3-Clause) license.

### Running the Code

There is a short end-to-end example in `src/example.ts`. You can run it with `yarn start`.

Example requests:

```sh
curl localhost:8888/foo -s
# {"foo":"lorem ipsum"}

curl localhost:8888/hello/world -s
# {"name":"world"}

curl localhost:8888/hello/world -s -X POST -d '{"greeting":"hi there"}'
# {"message":"hi there, world"}
```

There are a few basic example tests in `Http.test.ts`.
You can run them with:

```
yarn test
```
