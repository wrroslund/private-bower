var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var utils = require('../../infrastructure/utils');
var Promise = require('bluebird');
var logger = require('../../infrastructure/logger');
var exec = require('child_process').exec;

var RepoCacheBase = require('./repoCacheBase');

module.exports = function HgRepoCache(options) {
    var base = new RepoCacheBase(options);
    var _daemon;

    _init();
    function _init() {
        return _createDirectory(options.repoCacheRoot)
            .then(_checkHgInstalled)
            .then(function() {
                return new Promise(function(resolve) {
                    setInterval(_getLatestForRepos, options.refreshTimeout * 60 * 1000);
                    resolve();
                });
            })
            .then(_startHgDaemon)
            .catch(function(err) {
                logger.error('Failed to initialize public repository cache');
                process.nextTick(function() {
                    throw err;
                });
            });
    }

    function _cacheRepo(repoName, repoUrl) {
        return new Promise(function(resolve, reject) {
            var repoAccessAddress = base.getRepoAccessAddress();
            //var repo = '{0}://{1}/{2}'.format(options.protocol, repoAccessAddress, repoName);
            var repo = repoUrl;
            
            var repoObject = {
                name: repoName,
                url: repo
            };

            var repoDirectory = path.join(options.repoCacheRoot, repoName);

            if(fs.existsSync(repoDirectory)) {
                resolve(repoObject);

                return promise;
            }

            _cloneHgRepo(repoUrl, repoName)
                .then(function() {
                    resolve(repoObject);
                })
                .catch(function(err) {
                    logger.error('Failed to clone (maybe folder exists)' + repoUrl);
                    logger.error(err);

                    reject();
                });
        });
    }

    function _checkHgInstalled() {
        return utils.exec('hg --version')
            .catch(function(error) {
                logger.error('Mercurial must be installed');
                return error;
            });
    }

    function _createDirectory(dir) {
        return new Promise(function(resolve, reject) {
            mkdirp(dir, function(err) {
                if(err) {
                    reject();
                    return;
                }

                resolve();
            });
        });
    }

    function _startHgDaemon() {
        return new Promise(function(resolve, reject) {
            var customParameters = base.generateCustomParameters();
            var hgCommand = 'hg serve -d --webdir-conf {0} --address {1} -p {2} {3}';
            if (!options.hostName) {
                hgCommand = 'hg serve -d --webdir-conf {0} -p {2} {3}';
            }
            hgCommand = hgCommand.format(options.webdirConfig, options.hostName, options.port, customParameters);

            logger.log('Starting hg cache server');

            _daemon = exec(hgCommand, {cwd: options.repoCacheRoot}, function(error) {
                if(error) {
                    reject(error);
                    return;
                }

                logger.log('Hg cache server started');

                resolve();
            });
        });
    }

    function _cloneHgRepo(repoUrl, repoName) {
        var hgCommand = 'hg clone {0} {1}'.format(repoUrl.replace('hg+',''), repoName);

        logger.log('Cloning {0} ...'.format(repoName));

        return utils.exec(hgCommand, options.repoCacheRoot)
            .then(function() {
                logger.log('Cloned {0} hg repository to private'.format(repoName));
            });
    }

    function _getLatestForRepos() {
        logger.log('Refreshing cached public hg repositories');

        return base.getLatestForRepos(pullLatest);

        function pullLatest(packageDirectory) {
            var packageDirPath = path.join(options.repoCacheRoot, packageDirectory);

            return new Promise(function(resolve, reject) {
                if(fs.existsSync(packageDirPath)) {
                    fetchRepository()
                        .then(hardResetRepository)
                        .then(function() {
                            logger.log('Pulled latest for {0}'.format(path.basename(packageDirectory)));
                            resolve();
                        })
                        .catch(function(error) {
                            if(error && error.message) {
                                logger.error(error.message);
                            }
                            reject(error);
                        });
                }
                else {
                    logger.log('Could not pull latest, because "{0}" directory cannot be found'.format(packageDirPath));

                    resolve();
                }
            });

            function fetchRepository() {
                return utils.exec('hg pull', packageDirPath);
            }

            function hardResetRepository() {
                return utils.exec('hg update -C default', packageDirPath);
            }
        }
    }

    function _shutDown() {
        logger.log('Stopping hg cache server');

        if(_daemon) {
            _daemon.kill();
        }
    }

    return utils.extend({}, base, {
        shutDown: _shutDown,
        cacheRepo: _cacheRepo,
        getLatestForRepos: _getLatestForRepos
    });
};