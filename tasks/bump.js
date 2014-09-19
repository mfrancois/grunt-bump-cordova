/*
 * Increase version number
 *
 * grunt bump
 * grunt bump:git
 * grunt bump:patch
 * grunt bump:minor
 * grunt bump:major
 *
 * @author Vojta Jina <vojta.jina@gmail.com>
 * @author Mathias Paumgarten <mail@mathias-paumgarten.com>
 * @author Adam Biggs <email@adambig.gs>
 * @author Alan Accurso <accurso.alan@gmail.com>
 */

'use strict';

var semver = require('semver');
var exec = require('child_process').exec;
var xml2js = require('xml2js');
var parseString = xml2js.parseString;
var xmlBuilder = new xml2js.Builder();

module.exports = function(grunt) {

  var DESC = 'Increment the version, commit, tag and push.';
  grunt.registerTask('bump', DESC, function(versionType, incOrCommitOnly) {
    var opts = this.options({
      bumpVersion: true,
      files: ['package.json', 'bower.json', 'config.xml'],
      updateConfigs: [], // array of config properties to update (with files)
      commit: true,
      commitMessage: 'Release %VERSION%',
      commitFiles: ['package.json', 'bower.json', 'config.xml'], // '-a' for all files
      createTag: true,
      tagName: '%VERSION%',
      tagMessage: 'Version %VERSION%',
      push: true,
      pushTo: 'upstream',
      gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d'
    });

    if (incOrCommitOnly === 'bump-only') {
      grunt.verbose.writeln('Only incrementing the version.');

      opts.commit = false;
      opts.createTag = false;
      opts.push = false;
    }

    if (incOrCommitOnly === 'commit-only') {
      grunt.verbose.writeln('Only committing/tagging/pushing.');

      opts.bumpVersion = false;
    }

    var exactVersionToSet = grunt.option('setversion');
    if (!semver.valid(exactVersionToSet)) {
        exactVersionToSet = false;
    }

    var done = this.async();
    var queue = [];
    var next = function() {
      if (!queue.length) {
        return done();
      }
      queue.shift()();
    };
    var runIf = function(condition, behavior) {
      if (condition) {
        queue.push(behavior);
      }
    };

    var globalVersion; // when bumping multiple files
    var gitVersion;    // when bumping using `git describe`
    var XML_VERSION_REGEXP = /([\d||A-a|.|-]*)([\'|\"]?)/i;
    var VERSION_REGEXP = /([\'|\"]?version[\'|\"]?[ ]*:[ ]*[\'|\"]?)([\d||A-a|.|-]*)([\'|\"]?)/i;


    // GET VERSION FROM GIT
    runIf(opts.bumpVersion && versionType === 'git', function(){
      exec('git describe ' + opts.gitDescribeOptions, function(err, stdout, stderr){
        if (err) {
          grunt.fatal('Can not get a version number using `git describe`');
        }
        gitVersion = stdout.trim();
        next();
      });
    });


    // BUMP ALL FILES
    runIf(opts.bumpVersion, function(){
      grunt.file.expand(opts.files).forEach(function(file, idx) {
        var version = null;
        var fileString = grunt.file.read(file);
        var content;

        if (file === 'config.xml') {
          parseString(fileString, function (err, result) {
            result.widget.$.version = result.widget.$.version.replace(XML_VERSION_REGEXP, function (match, parsedVersion) {
                gitVersion = gitVersion && parsedVersion;
                version = exactVersionToSet || gitVersion || semver.inc(parsedVersion, versionType || 'patch');
                // Removes prerelease tag
                return !~version.indexOf('-') ? version : version.slice(0, version.indexOf('-'));
            });
            content = xmlBuilder.buildObject(result);
          });
        } else {
          content = fileString.replace(VERSION_REGEXP, function(match, prefix, parsedVersion, suffix) {
            gitVersion = gitVersion && parsedVersion + '-' + gitVersion;
            version = exactVersionToSet || gitVersion || semver.inc(parsedVersion, versionType || 'patch');
            return prefix + version + suffix;
          });
        }

        if (!version) {
          grunt.fatal('Can not find a version to bump in ' + file);
        }

        grunt.file.write(file, content);
        grunt.log.ok('Version bumped to ' + version + (opts.files.length > 1 ? ' (in ' + file + ')' : ''));

        if (!globalVersion) {
          globalVersion = version;
        } else if (globalVersion !== version) {
          grunt.warn('Bumping multiple files with different versions!');
        }

        var configProperty = opts.updateConfigs[idx];
        if (!configProperty) {
          return;
        }

        var cfg = grunt.config(configProperty);
        if (!cfg) {
          return grunt.warn('Can not update "' + configProperty + '" config, it does not exist!');
        }

        cfg.version = version;
        grunt.config(configProperty, cfg);
        grunt.log.ok(configProperty + '\'s version updated');
      });
      next();
    });


    // when only commiting, read the version from package.json / pkg config
    runIf(!opts.bumpVersion, function() {
      if (opts.updateConfigs.length) {
        globalVersion = grunt.config(opts.updateConfigs[0]).version;
      } else {
        globalVersion = grunt.file.readJSON(opts.files[0]).version;
      }

      next();
    });


    // COMMIT
    runIf(opts.commit, function() {
      var commitMessage = opts.commitMessage.replace('%VERSION%', globalVersion);

      exec('git commit ' + opts.commitFiles.join(' ') + ' -m "' + commitMessage + '"', function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not create the commit:\n  ' + stderr);
        }
        grunt.log.ok('Committed as "' + commitMessage + '"');
        next();
      });
    });


    // CREATE TAG
    runIf(opts.createTag, function() {
      var tagName = opts.tagName.replace('%VERSION%', globalVersion);
      var tagMessage = opts.tagMessage.replace('%VERSION%', globalVersion);

      exec('git tag -a ' + tagName + ' -m "' + tagMessage + '"' , function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not create the tag:\n  ' + stderr);
        }
        grunt.log.ok('Tagged as "' + tagName + '"');
        next();
      });
    });


    // PUSH CHANGES
    runIf(opts.push, function() {
      exec('git push ' + opts.pushTo + ' && git push ' + opts.pushTo + ' --tags', function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not push to ' + opts.pushTo + ':\n  ' + stderr);
        }
        grunt.log.ok('Pushed to ' + opts.pushTo);
        next();
      });
    });

    next();
  });


  // ALIASES
  DESC = 'Increment the version only.';
  grunt.registerTask('bump-only', DESC, function(versionType) {
    grunt.task.run('bump:' + (versionType || '') + ':bump-only');
  });

  DESC = 'Commit, tag, push without incrementing the version.';
  grunt.registerTask('bump-commit', DESC, 'bump::commit-only');
};
