'use strict';

const Scm = require('screwdriver-scm-base');
const hoek = require('hoek');
const url = require('url');

class BitbucketScm extends Scm {
    /**
     * Given a SCM webhook payload & its associated headers, aggregate the
     * necessary data to execute a Screwdriver job with.
     * @method parseHook
     * @param  {Object}  headers  The request headers associated with the webhook payload
     * @param  {Object}  payload  The webhook payload received from the SCM service.
     * @return {Object}           A key-map of data related to the received payload
     */
    _parseHook(headers, payload) {
        const [typeHeader, actionHeader] = headers['X-Event-Key'].split(':');
        const parsed = {};

        switch (typeHeader) {
        case 'repo': {
            if (actionHeader !== 'push') {
                throw new Error('Only push event is supported for repository');
            }
            const changes = hoek.reach(payload, 'push.changes');
            const link = url.parse(hoek.reach(payload, 'repository.links.html.href'));

            parsed.type = 'repo';
            parsed.action = 'push';
            parsed.username = hoek.reach(payload, 'actor.username');
            parsed.checkoutUrl = `${link.protocol}//${parsed.username}`
                + `@${link.hostname}${link.pathname}.git`;
            parsed.branch = hoek.reach(changes[0], 'new.name');
            parsed.sha = hoek.reach(changes[0], 'new.target.hash');

            return parsed;
        }
        case 'pullrequest': {
            if (actionHeader === 'created') {
                parsed.action = 'opened';
            } else if (actionHeader === 'fullfilled') {
                parsed.action = 'closed';
            } else {
                throw new Error('Only created and fullfilled events are supported for pullrequest');
            }

            const link = url.parse(hoek.reach(payload, 'repository.links.html.href'));

            parsed.type = 'pr';
            parsed.username = hoek.reach(payload, 'pullrequest.author.username');
            parsed.checkoutUrl = `${link.protocol}//${parsed.username}`
                + `@${link.hostname}${link.pathname}.git`;
            parsed.branch = hoek.reach(payload, 'pullrequest.source.branch.name');
            parsed.sha = hoek.reach(payload, 'pullrequest.source.commit.hash');
            parsed.prNum = hoek.reach(payload, 'pullrequest.id');
            parsed.prRef = `refs/pull-request/${parsed.prNum}/from`;

            return parsed;
        }
        default:
            throw new Error('Only repository and pullrequest events are supported');
        }
    }
}

module.exports = BitbucketScm;
