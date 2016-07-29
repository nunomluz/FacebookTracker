//localStorage.removeItem('_FBTrack_Current_Period');
//localStorage.removeItem('_FBTrack_Cache_Period');

var FBTrackExtension = (function() {
    return {
        _CURRENT_PERIOD_KEY: '_FBTrack_Current_Period',
        _CACHE_PERIOD_KEY: '_FBTrack_Cache_Period',
        _LAST_NOTIF_KEY: '_FBTrack_Notification_Data',
        
        AUTH_REFRESH_TIME: 14400000,    // 4 hours in ms
        STATS_REFRESH_TIME: 3000,       // 3 sec. in ms
        MIN_INACTIVE_TIME: 120000,      // 2 min. in ms
        MIN_SESSION_TIME: 20000,        // 20 sec. in ms
        
        TIMESTAMPS_FORMAT: 'YYYY-MM-DD HH:mm:ss',
        WARN_USAGE_PERCENT: [1, 0.75],
        
        _warned: [false, false],  // flag that indicates if the user was notified of >WARN_USAGE_PERCENT daily usage
        
        init: function() {
            function goToAuth() {
                // open backend login tab (or focus if already open)
                chrome.tabs.getAllInWindow(null, function(tabs) {
                    for (var i = 0, tab; tab = tabs[i]; i++) {
                        if (tab.url && tab.url.indexOf(Rest.FB_LOGIN_PAGE) == 0) {
                            chrome.tabs.update(tab.id, {selected: true});
                            chrome.tabs.executeScript(tab.id, {code: 'window.location.reload();'});
                            return;
                        }
                    }
                    chrome.tabs.create({url: Rest.FB_LOGIN_PAGE});
                });
            }
            
            // go to web app if browser icon is clicked
            chrome.browserAction.onClicked.addListener(function(activeTab) {
                goToAuth();
            });
            
            // setup backend authentication listener
            chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
                // only consider msgs from facebook auth
                if(!request.status) return;
                
                if (request.status === 'connected') {
                    // actual login to backend
                    Rest.auth('AT', request.authResponse.accessToken).done(function(resp) {
                        console.log('(Re-)authentication successful!');
                    });
                } else if (request.status === 'not_authorized') {
                    // logged, but not the app.
                    goToAuth();
                } else {
                    // not logged to fb
                    goToAuth();
                }
            });
            
            // setup access token renewal
            var t = this;
            this.doAuthentication(t);
            // re-new FB auth
            setTimeout(function() { t.doAuthentication(t); }, this.AUTH_REFRESH_TIME);    

            // setup facebook content script event listener
            chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
                t.actionDetected(request);
            });
            
            // setup monitor cycle
            if(!localStorage.getItem(this._CACHE_PERIOD_KEY)) {
                // init cache
                localStorage.setItem(this._CACHE_PERIOD_KEY, '[]');
            }
            this.doFlush(t);  
            setInterval(function() { t.doFlush(t); }, this.MIN_INACTIVE_TIME);            
        },
        
        getTimeString: function(d) {
            return moment(d ? d : new Date()).utc().format(this.TIMESTAMPS_FORMAT);
        },
        
        getMoment: function(str) {
            return moment.utc(str);
        },
        
        getSessionDuration: function(session) {
            return this.getMoment(session.end_ts).valueOf() - this.getMoment(session.start_ts).valueOf();
        },
        
        // (re-)authenticate the user through the facebook api
        doAuthentication: function(t) {
            // open backend page, which will request the access token to Facebook
            // and send it through a message to the extension
            $('iframe#auth-frame').attr('src', Rest.FB_LOGIN_BACKGROUND);
        },
        
        // flush cached and current timelogs (send them to the server)
        doFlush: function(t) {
            console.log('Flushing cached timelogs...');        
            var cache = JSON.parse(localStorage.getItem(t._CACHE_PERIOD_KEY));
            if(cache.length <= 0) {
                console.log('Nothing cached to flush.');
            } else {
                Rest.updateTimelog(cache).done(function(resp) {
                    console.log('Cached timelogs sent to server!');
                    localStorage.setItem(t._CACHE_PERIOD_KEY, '[]');
                }).fail(function(resp, msg, err) {
                    console.error('Unable to create cached timelogs! Not removed from cache...', err);
                });
            }
            
            console.log('Flushing current timelog...');
            if(!localStorage.getItem(t._CURRENT_PERIOD_KEY)) {
                console.log('No current timelog to flush.');
            } else {
                var current = JSON.parse(localStorage.getItem(t._CURRENT_PERIOD_KEY));
                Rest.updateTimelog(current).done(function(resp) {
                    console.log('Current timelog sent to server!');
                    current = JSON.parse(localStorage.getItem(t._CURRENT_PERIOD_KEY));
                    current.timelog_id = JSON.parse(resp)[0].timelog_id;
                    localStorage.setItem(t._CURRENT_PERIOD_KEY, JSON.stringify(current));
                }).fail(function(resp, msg, err) {
                    console.error('Unable to update current timelog!', err);
                });
            }
            
            setTimeout(function() {
                Rest.getStats(moment.utc().format(this.TIMESTAMPS_FORMAT)).done(function(resp) {
                    var stats = JSON.parse(resp);
                    t.drawIcon(stats);
                    t.updateNotification(stats);
                }).fail(function (resp, msg, err) {
                    console.error('Unable to get stats!', err);
                });
            }, t.STATS_REFRESH_TIME);
        },
        
        // routine to handle detected actions in a facebook page
        actionDetected: function(action) {
            // init current timelog if non-existent
            if(!localStorage.getItem(this._CURRENT_PERIOD_KEY)) {
                localStorage.setItem(this._CURRENT_PERIOD_KEY, JSON.stringify({
                    start_ts: action.moment,
                    end_ts: moment.utc(action.moment).add(1, 'seconds').format(this.TIMESTAMPS_FORMAT)
                }));
                return;
            }
            
            var json = JSON.parse(localStorage.getItem(this._CURRENT_PERIOD_KEY));
            var endTs = this.getMoment(json.end_ts);
            var m = this.getMoment(action.moment);
            var diff = m.valueOf() - endTs.valueOf();
            
            // check if the user has been inactive for MIN_INACTIVE_TIME
            // if not, just increment the current timelog
            if(diff < this.MIN_INACTIVE_TIME) {
                json.end_ts = action.moment;
                console.log('Ongoing Facebook Session for ' + this.getSessionDuration(json));
                localStorage.setItem(this._CURRENT_PERIOD_KEY, JSON.stringify(json));
                return;
            }
            
            // if MIN_INACTIVE_TIME or more has passed since the last action
            // cache the current timelog, and create a new one
            
            // enforce a minimum timelog duration of MIN_SESSION_TIME
            if(this.getSessionDuration(json) < this.MIN_SESSION_TIME) {
                json.end_ts = this.getMoment(json.start_ts).clone().add(this.MIN_SESSION_TIME, 'milliseconds').format(this.TIMESTAMPS_FORMAT);
            }
            
            console.log('Finished Facebook Session of ' + this.getSessionDuration(json));
            
            // push to cache
            var cache = JSON.parse(localStorage.getItem(this._CACHE_PERIOD_KEY));
            cache.push(json);
            localStorage.setItem(this._CACHE_PERIOD_KEY, JSON.stringify(cache));
            localStorage.removeItem(this._CURRENT_PERIOD_KEY);
        },
        
        // draw browser icon according to facebook daily usage percentage
        drawIcon: function(stats) {
            var canvas = document.getElementById('drawingCanvas');
            if(canvas == undefined || drawingCanvas == null) {
                $('body').append('<canvas id="drawingCanvas"></canvas>');
                canvas = document.getElementById('drawingCanvas');
            } else {
                canvas.html = '';
            }
            
            var percentMaxTime = stats.day_percent;
            if(percentMaxTime > 1) {
                percentMaxTime = 1;
            }
            
            function getFriendlyDuration(ms) {
                var min = ms / 60000;
                if(min > 60) {
                    return Math.floor(min/60);
                } else {
                    return Math.floor(min) + 'm';
                }
            }
            
            // check the element is in the DOM and the browser supports canvas
            if(canvas.getContext) {
                canvas.width = 19;
                canvas.height = 19;
                
                var c = canvas.getContext('2d');
                
                c.beginPath();
                c.arc(9.5, 9.5, 8.5, 0, Math.PI*2, false);
                c.closePath();
                c.lineWidth = 2;
                c.strokeStyle = '#EB4E29';
                c.stroke();
                
                c.beginPath();
                c.arc(9.5, 9.5, 6.5, 0, Math.PI*2*percentMaxTime, false);
                if(percentMaxTime < 1) {
                    c.lineTo(9.5, 9.5);
                }
                c.closePath();
                c.fillStyle = percentMaxTime < 0.25 ? '#1DA956' : (percentMaxTime < 0.5 ? '#1F7194' : (percentMaxTime < 0.75 ? '#EB8F29' : '#EB4E29'));
                c.fill();
                
                var imageData = c.getImageData(0, 0, 19, 19);
                chrome.browserAction.setIcon({ imageData: imageData	});
                chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 170] });
                chrome.browserAction.setBadgeText({ text: getFriendlyDuration(stats.day_duration) });
            }
        },
        
        // show a notification if the facebook daily usage percentage exceeds WARN_USAGE_PERCENT
        updateNotification:  function(stats) {
            var done = false;
            for(var i=0; i<this.WARN_USAGE_PERCENT.length && !done; i++) {
                if(stats.day_percent >= this.WARN_USAGE_PERCENT[i]) {
                    done = true;
                    
                    var t = this;
                    var opts = {
                        type: "basic",
                        title: "Facebook Usage",
                        message: "You have used " + stats.day_percent_friendly + " of your established maximum Facebook time today.",
                        iconUrl: "/img/icon96.png"
                    };
                    
                    if(!this._warned[i]) {
                        (function(ii) {
                            chrome.notifications.create(t._LAST_NOTIF_KEY, opts, function(id) {
                                if(t._LAST_NOTIF_KEY == id) {
                                    t._warned[ii] = true;
                                }
                            });
                        })(i);
                    } else {
                        chrome.notifications.update(this._LAST_NOTIF_KEY, opts);
                    }
                }
            }
        }
    };
})();

var Rest = FBTrackClient('{{FB_API_KEY}}');   // API key (replaced during deployment)
$(document).ready(function() {
	FBTrackExtension.init();
});
