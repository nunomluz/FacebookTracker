require('dotenv').config();
var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var sass = require('gulp-sass');
var del = require('del');
var merge = require('merge-stream');
var replace = require('gulp-replace');

var tasks = [];
var distConfig = {
    root: './dist',
    optionsPath: './dist/options',
    popupPath: './dist/popup',
    
    optionsCssFile: 'options.css',
    popupCssFile: 'popup.css',
    
    optionsScriptFile: 'options.js',
    popupScriptFile: 'popup.js',
    
    bgScriptFile: 'background.js',
    contentScriptFile: 'cs.js'
};
var srcConfig = {
  root: './src',
  
  // base is srcConfig.root
  rootCopyPaths: ['src/background.html', 'src/manifest.json', 'src/img/*', 'src/libs/*',
    'src/options/*.html', 'src/popup/*.html'],
  
  optionsScriptPaths: ['src/options/*.js'],
  optionsSassPaths: ['src/options/*.scss'],
  
  popupScriptPaths: ['src/popup/*.js'],
  popupSassPaths: ['src/popup/*.scss'],
  
  bgScriptPaths: ['src/background.js'],
  contentScriptPaths: ['src/content-scripts/*.js']
};

// CLEAN ALL
gulp.task('cleanDist', function() {
    del.sync([distConfig.root], {force: true});
});

// COPY BUILD TASK
gulp.task('buildCopy', ['cleanDist'], function() {
	var streams = [];
    streams.push(gulp
        .src(srcConfig.rootCopyPaths, {base: srcConfig.root})  
        .pipe(gulp.dest(distConfig.root))
    );
    return streams.length === 1 ? streams[0] : merge(streams);
});

// SCRIPT CONCAT + UGLIFY BUILD TASK
gulp.task('buildScripts', ['cleanDist'], function() {
    var streams = [];
    streams.push(gulp
        .src(srcConfig.bgScriptPaths)
        .pipe(replace(/\{\{[^\}]+\}\}/, function(search) {
            console.log(search.substring(2, search.length-2));
            return process.env[search.substring(2, search.length-2)];
        }))
        .pipe(uglify())
        .pipe(concat(distConfig.bgScriptFile))
        .pipe(gulp.dest(distConfig.root))
    );
    streams.push(gulp
        .src(srcConfig.contentScriptPaths)
        .pipe(uglify())
        .pipe(concat(distConfig.contentScriptFile))
        .pipe(gulp.dest(distConfig.root))
    );
    streams.push(gulp
        .src(srcConfig.optionsScriptPaths)
        .pipe(uglify())
        .pipe(concat(distConfig.optionsScriptFile))
        .pipe(gulp.dest(distConfig.optionsPath))
    );
    streams.push(gulp
        .src(srcConfig.popupScriptPaths)
        .pipe(uglify())
        .pipe(concat(distConfig.popupScriptFile))
        .pipe(gulp.dest(distConfig.popupPath))
    );
    return streams.length === 1 ? streams[0] : merge(streams);
});

// SASS PRE-COMPILE + CONCAT BUILD TASK
gulp.task('buildSass', ['cleanDist'], function () {
    var streams = [];
    streams.push(gulp
        .src(srcConfig.optionsSassPaths)
        .pipe(sass())
        .pipe(concat(distConfig.optionsCssFile))
        .pipe(gulp.dest(distConfig.optionsPath))
    );
    streams.push(gulp
        .src(srcConfig.popupSassPaths)
        .pipe(sass())
        .pipe(concat(distConfig.popupCssFile))
        .pipe(gulp.dest(distConfig.popupPath))
    );
    return streams.length === 1 ? streams[0] : merge(streams);
});
 
gulp.task('build', ['cleanDist', 'buildCopy', 'buildScripts', 'buildSass']);
gulp.task('buildWatch', function() {
    gulp.watch(srcConfig.root + '/**/*', ['build']);
});

gulp.task('default', ['build', 'buildWatch']);