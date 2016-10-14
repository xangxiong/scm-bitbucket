'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const testPayloadOpen = require('./data/pr.opened.json');
const testPayloadClose = require('./data/pr.closed.json');
const testPayloadPush = require('./data/repo.push.json');

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

/**
 * Stub for circuit-fuses wrapper
 * @method BreakerMock
 */
function BreakerMock() {}

describe('index', () => {
    let BitbucketScm;
    let scm;
    let requestMock;
    let breakRunMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        requestMock = sinon.stub();
        breakRunMock = {
            runCommand: sinon.stub(),
            stats: sinon.stub().returns({
                requests: {
                    total: 1,
                    timeouts: 2,
                    success: 3,
                    failure: 4,
                    concurrent: 5,
                    averageTime: 6
                },
                breaker: {
                    isClosed: false
                }
            })
        };

        BreakerMock.prototype = breakRunMock;
        mockery.registerMock('circuit-fuses', BreakerMock);
        mockery.registerMock('request', requestMock);

        /* eslint-disable global-require */
        BitbucketScm = require('../index');
        /* eslint-enable global-require */

        scm = new BitbucketScm();
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('parseUrl', () => {
        const apiUrl = 'https://api.bitbucket.org/2.0/repositories/batman/test/refs/branches/';
        const token = 'myAccessToken';
        let fakeResponse;

        beforeEach(() => {
            fakeResponse = {
                statusCode: 200,
                body: {
                    repository: {
                        html: {
                            href: 'https://bitbucket.org/batman/test'
                        }
                    },
                    type: 'repository',
                    name: 'test',
                    full_name: 'batman/test',
                    uuid: '{de7d7695-1196-46a1-b87d-371b7b2945ab}'
                }
            };
            breakRunMock.runCommand.resolves(fakeResponse);
        });

        it('resolves to the correct parsed url for ssh', () => {
            const expected =
                'bitbucket.org:batman/{de7d7695-1196-46a1-b87d-371b7b2945ab}:master';
            const expectedOptions = {
                url: `${apiUrl}master`,
                method: 'GET',
                login_type: 'oauth2',
                oauth_access_token: token
            };

            return scm.parseUrl({
                checkoutUrl: 'git@bitbucket.org:batman/test.git#master',
                token
            }).then((parsed) => {
                assert.calledWith(breakRunMock.runCommand, expectedOptions);
                assert.equal(parsed, expected);
            });
        });

        it('resolves to the correct parsed url for https', () => {
            const expected =
                'bitbucket.org:batman/{de7d7695-1196-46a1-b87d-371b7b2945ab}:mynewbranch';
            const expectedOptions = {
                url: `${apiUrl}mynewbranch`,
                method: 'GET',
                login_type: 'oauth2',
                oauth_access_token: 'myAccessToken'
            };

            return scm.parseUrl({
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git#mynewbranch',
                token: 'myAccessToken'
            }).then((parsed) => {
                assert.calledWith(breakRunMock.runCommand, expectedOptions);
                assert.equal(parsed, expected);
            });
        });

        it('rejects if request fails', () => {
            const err = new Error('Bitbucket API error');
            const expectedOptions = {
                url: `${apiUrl}mynewbranch`,
                method: 'GET',
                login_type: 'oauth2',
                oauth_access_token: 'myAccessToken'
            };

            breakRunMock.runCommand.rejects(err);

            return scm.parseUrl({
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git#mynewbranch',
                token: 'myAccessToken'
            })
            .then(() => assert.fail('Should not get here'))
            .catch((error) => {
                assert.calledWith(breakRunMock.runCommand, expectedOptions);
                assert.deepEqual(error, err);
            });
        });

        it('rejects if status code is not 200', () => {
            const expectedOptions = {
                url: `${apiUrl}mynewbranch`,
                method: 'GET',
                login_type: 'oauth2',
                oauth_access_token: 'myAccessToken'
            };

            fakeResponse = {
                statusCode: 404,
                body: {
                    error: {
                        message: 'Resource not found',
                        detail: 'There is no API hosted at this URL'
                    }
                }
            };

            breakRunMock.runCommand.resolves(fakeResponse);

            return scm.parseUrl({
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git#mynewbranch',
                token: 'myAccessToken'
            })
            .then(() => assert.fail('Should not get here'))
            .catch((error) => {
                assert.calledWith(breakRunMock.runCommand, expectedOptions);
                assert.match(error.message, 'STATUS CODE 404');
            });
        });
    });

    describe('parseHook', () => {
        it('returns the correct parsed config for opened PR', () => {
            const expected = {
                type: 'pr',
                action: 'opened',
                username: 'batman',
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git',
                branch: 'mynewbranch',
                sha: '40171b678527',
                prNum: 3,
                prRef: 'refs/pull-request/3/from'
            };
            const headers = {
                'X-Event-Key': 'pullrequest:created'
            };

            return scm.parseHook(headers, testPayloadOpen)
                .then(result => assert.deepEqual(result, expected));
        });

        it('returns the correct parsed config for closed PR', () => {
            const expected = {
                type: 'pr',
                action: 'closed',
                username: 'batman',
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git',
                branch: 'mynewbranch',
                sha: '40171b678527',
                prNum: 3,
                prRef: 'refs/pull-request/3/from'
            };
            const headers = {
                'X-Event-Key': 'pullrequest:fullfilled'
            };

            return scm.parseHook(headers, testPayloadClose)
                .then(result => assert.deepEqual(result, expected));
        });

        it('returns the correct parsed config for push to repo event', () => {
            const expected = {
                type: 'repo',
                action: 'push',
                username: 'batman',
                checkoutUrl: 'https://batman@bitbucket.org/batman/test.git',
                branch: 'stuff',
                sha: '9ff49b2d1437567cad2b5fed7a0706472131e927'
            };
            const headers = {
                'X-Event-Key': 'repo:push'
            };

            return scm.parseHook(headers, testPayloadPush)
                .then(result => assert.deepEqual(result, expected));
        });

        it('throws error if events are not supported', () => {
            const repoFork = {
                'X-Event-Key': 'repo:fork'
            };
            const prComment = {
                'X-Event-Key': 'pullrequest:comment_created'
            };
            const issueCreated = {
                'X-Event-Key': 'issue:created'
            };

            scm.parseHook(repoFork, {})
                .then(() => assert.fail('Should not get here'))
                .catch((error) => {
                    assert.deepEqual(error.message,
                        'Only push event is supported for repository');
                });

            scm.parseHook(prComment, {})
                .then(() => assert.fail('Should not get here'))
                .catch((error) => {
                    assert.deepEqual(error.message,
                        'Only created and fullfilled events are supported for pullrequest');
                });

            scm.parseHook(issueCreated, {})
                .then(() => assert.fail('Should not get here'))
                .catch((error) => {
                    assert.deepEqual(error.message,
                        'Only repository and pullrequest events are supported');
                });
        });
    });

    describe('stats', () => {
        it('returns the correct stats', () => {
            assert.deepEqual(scm.stats(), {
                requests: {
                    total: 1,
                    timeouts: 2,
                    success: 3,
                    failure: 4,
                    concurrent: 5,
                    averageTime: 6
                },
                breaker: {
                    isClosed: false
                }
            });
        });
    });
});
