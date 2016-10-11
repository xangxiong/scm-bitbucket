# scm-bitbucket
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][status-image]][status-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]

> This scm plugin extends the [scm-base-class](https://github.com/screwdriver-cd/scm-base), and provides methods to fetch and update data in Bitbucket.

## Usage

```bash
npm install screwdriver-scm-bitbucket
```

### parseHook
Required parameters:

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| headers        | Object | Request header |
| payload        | Object | Request payload |

#### Expected Outcome
An object with the following fields:
```js
{
    type: 'pr',         // can be 'pr' or 'repo'
    action: 'opened',   // can be 'opened', 'closed', or 'synchronized' for type 'pr'; 'push' for type 'repo'
    username: 'batman',
    url: 'https://batman@bitbucket.org/batman/test.git',
    branch: 'mynewbranch',
    sha: '40171b678527',
    prNumber: 3,
    prRef: 'refs/pull-requests/3/from'
}
```

## Testing

```bash
npm test
```

## License

Code licensed under the BSD 3-Clause license. See LICENSE file for terms.

[npm-image]: https://img.shields.io/npm/v/screwdriver-scm-bitbucket.svg
[npm-url]: https://npmjs.org/package/screwdriver-scm-bitbucket
[downloads-image]: https://img.shields.io/npm/dt/screwdriver-scm-bitbucket.svg
[license-image]: https://img.shields.io/npm/l/screwdriver-scm-bitbucket.svg
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/scm-bitbucket.svg
[issues-url]: https://github.com/screwdriver-cd/scm-bitbucket/issues
[status-image]: https://cd.screwdriver.cd/pipelines/b1bdad711ff12c229a9fa6ed7831703dd74c3a93/badge
[status-url]: https://cd.screwdriver.cd/pipelines/b1bdad711ff12c229a9fa6ed7831703dd74c3a93
[daviddm-image]: https://david-dm.org/screwdriver-cd/scm-bitbucket.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/screwdriver-cd/scm-bitbucket
