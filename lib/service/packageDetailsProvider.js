
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');

var logger = require('../infrastructure/logger');
var utils = require('../infrastructure/utils');

module.exports = function PackageDetailsProvider() {
    var tempFolder = path.join(utils.dirname, 'temp/packageDetails');
    
    function _getPackageDetails(packageUrl) {
        return new Promise(function(resolve, reject) {
            var tempName = utils.getRandomString();
            var gitCloneFolder = path.join(tempFolder, tempName);
            var exec = 'git clone {0} {1} --depth=1'.format(packageUrl, gitCloneFolder);
            if(packageUrl.indexOf('hg+') !== -1) {
                exec = 'hg clone {0} {1}'.format(packageUrl.replace("hg+",""), gitCloneFolder);
            }
            if(packageUrl){
                try{
                    utils.exec(exec)
                    .then(function(res) {
                        var bowerJsonLocation = path.join(gitCloneFolder, 'bower.json');
                        
                        var fileContent = fs.readFileSync(bowerJsonLocation);
                        var bowerJson = JSON.parse(fileContent);
                        
                        utils.removeDirectory(gitCloneFolder);
                        
                        resolve(bowerJson);
                    },function(res){
                        logger.log('failure cloning repo');
                        logger.log(res);
                    })
                    .catch(reject);
                }catch(err){
                    logger.log("ERROR");
                    logger.log(err);
                }
            }
        });
    }
    
    return {
        getPackageDetails: _getPackageDetails
    };
}();