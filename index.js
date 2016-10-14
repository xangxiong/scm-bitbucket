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

/**
 * @method getScmUriParts
 * @param  {String}     scmUri
 * @return {Object}
 */
function getScmUriParts(scmUri) {
    const scm = {};

    [scm.hostname, scm.repoId, scm.branch] = scmUri.split(':');

    return scm;
}

class BitbucketScm extends Scm {
    /**
     * Constructor for Scm
     * @method constructor
     * @param  {Object}    config               Configuration
     * @param  {String}    [config.fusebox]     Options for the circuit breaker
     * @return {ScmBase}
     */
    constructor(config) {
        super(config);

        this.breaker = new Fusebox(request, config.fusebox);
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
            `/refs/branches/${repoInfo.branch}?access_key=${config.token}`;
        const options = {
            url: getBranchUrl,
            method: 'GET'
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
     * Decorate the author based on the Bitbucket
     * @method _decorateAuthor
     * @param  {Object}        config          Configuration object
     * @param  {Object}        config.token    Access token to authenticate with Bitbucket
     * @param  {Object}        config.username Username to query more information for
     * @return {Promise}
     */
    _decorateAuthor(config) {
        const options = {
            url: `${API_URL}/users/${config.username}?access_key=${config.token}`,
            method: 'GET'
        };

        return this.breaker.runCommand(options)
            .then((response) => {
                const body = response.body;

                if (response.statusCode !== 200) {
                    throw new Error(`STATUS CODE ${response.statusCode}: ${body}`);
                }

                return {
                    url: body.links.html.href,
                    name: body.display_name,
                    username: body.username,
                    avatar: body.links.avatar.href
                };
            });
    }

   /**
    * Decorate a given SCM URI with additional data to better display
    * related information. If a branch suffix is not provided, it will default
    * to the master branch
    * @method decorateUrl
    * @param  {Config}    config         Configuration object
    * @param  {String}    config.scmUri  The SCM URI the commit belongs to
    * @param  {String}    config.token   Service token to authenticate with Github
    * @return {Object}
    */
    _decorateUrl(config) {
        const scm = getScmUriParts(config.scmUri);
        const options = {
            url: `${API_URL}/repositories/${scm.repoId}?access_key=${config.token}`,
            method: 'GET'
        };

        return this.breaker.runCommand(options)
            .then((response) => {
                const body = response.body;

                if (response.statusCode !== 200) {
                    throw new Error(`STATUS CODE ${response.statusCode}: ${body}`);
                }

                return {
                    url: body.links.html.href,
                    name: body.full_name,
                    branch: scm.branch
                };
            });
    }

    /**
     * Decorate the commit based on the repository
     * @method _decorateCommit
     * @param  {Object}        config           Configuration object
     * @param  {Object}        config.sha       Commit sha to decorate
     * @param  {Object}        config.scmUri    SCM URI the commit belongs to
     * @param  {Object}        config.token     Service token to authenticate with Github
     * @return {Promise}
     */
    _decorateCommit(config) {
        const scm = getScmUriParts(config.scmUri);
        const options = {
            url: `${API_URL}/repositories/${scm.repoId}` +
                `/commit/${config.sha}?access_key=${config.token}`,
            method: 'GET'
        };

        return this.breaker.runCommand(options)
            .then((response) => {
                const body = response.body;

                if (response.statusCode !== 200) {
                    throw new Error(`STATUS CODE ${response.statusCode}: ${body}`);
                }

                // eslint-disable-next-line
                return this._decorateAuthor({
                    username: body.author.user.username,
                    token: config.token
                }).then(author => ({
                    url: body.links.html.href,
                    message: body.message,
                    author
                }));
            });
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
