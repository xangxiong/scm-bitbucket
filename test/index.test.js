'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');

const testPayloadOpen = require('./data/pr.opened.json');
const testPayloadClose = require('./data/pr.closed.json');
const testPayloadPush = require('./data/repo.push.json');

sinon.assert.expose(assert, { prefix: '' });

describe('index', () => {
    let BitbucketScm;
    let scm;

    beforeEach(() => {
        /* eslint-disable global-require */
        BitbucketScm = require('../index');
        /* eslint-enable global-require */

        scm = new BitbucketScm();
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

            assert.throws(() => scm.parseHook(repoFork, {}),
                'Only push event is supported for repository');
            assert.throws(() => scm.parseHook(prComment, {}),
                'Only created and fullfilled events are supported for pullrequest');
            assert.throws(() => scm.parseHook(issueCreated, {}),
                'Only repository and pullrequest events are supported');
        });
    });
});
