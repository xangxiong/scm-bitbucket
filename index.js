'use strict';

const Fusebox = require('circuit-fuses');
const Scm = require('screwdriver-scm-base');
const hoek = require('hoek');
const url = require('url');
const request = require('request');
const schema = require('screwdriver-data-schema');
const API_URL = 'https://api.bitbucket.org/2.0';
const MATCH_COMPONENT_HOSTNAME = 1;
const MATCH_COMPONENT_USER = 2;
const MATCH_COMPONENT_REPO = 3;
const MATCH_COMPONENT_BRANCH = 4;

/**
 * Get repo information
 * @method  getRepoInfo
 * @param   {String}    checkoutUrl     The url to check out repo
 * @return  {Object}                    An object with host, repo, branch, and username
 */
function getRepoInfo(checkoutUrl) {
    const regex = schema.config.regex.CHECKOUT_URL;
    const matched = regex.exec(checkoutUrl);

    return {
        hostname: matched[MATCH_COMPONENT_HOSTNAME],
        username: matched[MATCH_COMPONENT_USER],
        repo: matched[MATCH_COMPONENT_REPO],
        branch: matched[MATCH_COMPONENT_BRANCH].slice(1)
    };
}

class BitbucketScm extends Scm {
    /**
     * Constructor for Scm
     * @method constructor
     * @param  {Object}    config       Configuration
     * @return {ScmBase}
     */
    constructor(config) {
        super(config);

        this.breaker = new Fusebox(request);
    }

    /**
     * Parse the url for a repo for the specific source control
     * @method parseUrl
     * @param  {Object}    config
     * @param  {String}    config.checkoutUrl       Url to parse
     * @param  {String}    config.token             The token used to authenticate to the SCM
     * @return {Promise}
     */
    _parseUrl(config) {
        const repoInfo = getRepoInfo(config.checkoutUrl);
        const getBranchUrl = `${API_URL}/repositories/${repoInfo.username}/${repoInfo.repo}` +
            `/refs/branches/${repoInfo.branch}`;
        const options = {
            url: getBranchUrl,
            method: 'GET',
            login_type: 'oauth2',
            oauth_access_token: config.token
        };

        return this.breaker.runCommand(options)
            .then((response) => {
                if (response.statusCode !== 200) {
                    throw new Error(`STATUS CODE ${response.statusCode}: ${response.body}`);
                }

                return `${repoInfo.hostname}:${repoInfo.username}` +
                    `/${response.body.uuid}:${repoInfo.branch}`;
            });
    }

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

    /**
    * Retreive stats for the scm
    * @method stats
    * @param  {Response}    Object          Object containing stats for the scm
    */
    stats() {
        return this.breaker.stats();
    }
}

module.exports = BitbucketScm;
