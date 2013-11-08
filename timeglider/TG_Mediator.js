/*
 * Timeglider for Javascript / jQuery 
 * http://timeglider.com/jquery
 *
 * Copyright 2013, Mnemograph LLC
 * Licensed under Timeglider Dual License
 * http://timeglider.com/jquery/?p=license
 *
 */

/*******************************
	TIMELINE MEDIATOR
	� handles timeline behavior, 
	� reflects state back to view
	� owns the timeline and event data models

********************************/
(function(tg){
  
  
	var MED = {},
		TG_Date = tg.TG_Date,
		options = {},
		$ = jQuery,
		$container = {},
		container_name = '';
	      
	      
	
	tg.TG_Mediator = function (wopts, $el) {
	  
	    this.options = options = wopts;
	    
	   	$container = $el;
	   	
	   	container_name = wopts.base_namespace + "#" + $container.attr("id");
		
		this.viewMode = "timeline";
		
	    // these relate to the display ------ not individual timeline attributes
	    this._focusDate = {};
	    this._zoomInfo = {};
	    this._zoomLevel = 0;
	    
	    this.ticksReady = false;
	    this.ticksArray = [];
	    this.startSec = 0;
	    this.activeTimelines = [];
	    this.max_zoom = options.max_zoom;
	    this.min_zoom = options.min_zoom;
	    
	    this.icon_folder = tg.icon_folder = options.icon_folder || "js/timeglider/icons/";
	    
	    // setting this without setTimeoffset to avoid refresh();
	    this.timeOffset = TG_Date.getTimeOffset(options.timezone);
	    
	    this.base_font_size = 14;
	  
	    this.fixed_zoom = (this.max_zoom == this.min_zoom) ? true : false;
	    this.gesturing = false;
	    this.gestureStartZoom = 0;
	    this.gestureStartScale = 0; // .999 etc reduced to 1 to 100
	    this.filters = {include:"", exclude:"", legend:[], tags:[]};
	    
	    this.filterActions = {};
	
		this.loadedSources = [];
	    this.timelineCollection = new Backbone.Collection();
	    
	    this.eventCollection = new tg.TG_EventCollection();
	    
	    this.imagesSized = 0;
	    this.imagesToSize = 0;
	    this.timelineDataLoaded = false,
	    
	    this.image_lane_height = 0;
	
	    // this.setZoomLevel(options.initial_zoom);
	    this.initial_timelines = [];
	    this.initial_timeline_id = options.initial_timeline_id || "";
	    this.sole_timeline_id = "";
	    
	    this.dimensions = {};
	    
	    this.focusedEvent = '';
	    
	    this.singleTimelineID = 0;
	    this.scopeChanges = 0;
	    
	    this.initialScope = {};
	    this.scopeCache = {};
	    
	    
	    if (options.max_zoom === options.min_zoom) {
	      this.fixed_zoom = options.min_zoom;
	    }
	    
	    if (options.main_map) {
	    	this.main_map = options.main_map;
	    	timeglider.mapping.setMap(this.main_map, this);
	    }
	
	    MED = this;
	
	} // end mediator head
    
    

	tg.TG_Mediator.prototype = {
	
		// clears the events and timelines collections
		emptyData: function() {
		
			this.eventCollection.reset();
			this.timelineCollection.reset();
			
			this.eventCollection = new tg.TG_EventCollection();
			this.timelineCollection = new Backbone.Collection();
			this.activeTimelines = [];
		},
		
		
		focusToEvent: function(ev, callback){
			// !TODO open event, bring to zoom
			this.focusedEvent = ev;
			this.gotoDateZoom(ev.startdateObj.dateStr)
			$.publish(container_name + ".mediator.focusToEvent");
			
			if (typeof callback == "function") {
				callback(ev);
			}
		},
		
		/*
		 * filterBy
		 * @param type {String} tags|include|exclude|legend
		 * @param content {String} content to be filtered, i.e. keyword, etc
		 *
		 */
		filterBy: function(type, content){
			// !TODO open event, bring to zoom
			var fObj = {origin:type};
			fObj[type] = content;
			this.setFilters(fObj);
		},
		
		
		setImageLaneHeight: function(new_height, ref, set_ui) {
			this.image_lane_height = new_height;
			
			if (set_ui) {
				$.publish(container_name + ".mediator.imageLaneHeightSetUi");
			}
			
			if (ref) {
				this.refresh();
			}
			
			
		},
		
		
		setInitialScope: function() {
			this.initialScope = this.scopeCache;
			$.publish(container_name + ".mediator.initialScope");
		},
		
		getInitialScope: function() {
			return this.initialScope;
		},
		
		

	    /* PUBLIC METHODS MEDIATED BY $.widget front */
	    gotoDateZoom: function (fdStr, zoom) {
	    	
	        var fd = new TG_Date(fdStr),
	            zl = false;
	        this.setFocusDate(fd);
	        
	        // setting zoom _does_ refresh automatically
	        if (zoom) { 
	        	var zl = this.setZoomLevel(zoom);
	        };
	        
	        if (!zoom || zl == false) { 
	        	this.refresh(); 
	        }
	        
	        $.publish(container_name + ".mediator.scopeChange");
	    },
	    
	    
	    zoom : function (n) {
	      var new_zoom = this.getZoomLevel() + parseInt(n);
	      this.setZoomLevel(new_zoom);
	    },
	    
	    
	    focusTimeline: function(timeline_id) {
	    	var tl = this.timelineCollection.get(timeline_id);
	    	var fd = tl.get("focus_date");
	    	var zl = tl.get("initial_zoom");
	    	
	    	this.gotoDateZoom(fd, zl);
	    	
	    },
	    
	    
	    
	    loadPresentation: function(presentation_object) {
	    	
	    	var me = this,
	    		po = presentation_object,
	    		tls = po.timelines,
	    		tid = "",
	    		active = [],
	    		inverted = 0,
	    		bottom = 0,
	    		display = "expanded",
	    		real_tl = {};
	    	
	    	if (po.timelines.length > 0) {
	    		
	    		_.each(tls, function(tl) {
	    			if (tl.open == 1) {
		    			tid = tl.timeline_id;
		    			active.push(tid);
		    			bottom = tl.bottom || 30;
		    			display = tl.display || "expanded";
		    			inverted = tl.inverted || 0;
		    			
		    			real_tl = me.timelineCollection.get(tid);
		    			real_tl.set({"inverted":inverted, "display":display, "bottom":bottom});
	    			}
	    		});	    		
	    		
	    		me.setFocusDate(new tg.TG_Date(po.focus_date));
	    		me.activeTimelines = active;
	    		me.setZoomLevel(po.initial_zoom);
				
				me.setImageLaneHeight(po.image_lane_height || 0, false, true);
				
				
				me.refresh();
				
				

	    	} else {
	    		// WTF no timelines	
	    		alert("There are no timelines in this presentation...");
	    		return false;
	    	}
	    },	
	    
	    
	    /* reloadTimeline
	     * wipes out and re-loads a timeline according to already-loaded ID
	     * @param id {String} timeline id of already-loaded timeline
	     * @param source {String} path to JSON for updated timeline data
	     *
	    */
	    reloadTimeline: function(id, source) {
	    	
	    	var tl_model  = this.timelineCollection.get(id);
	    	var evts = this.eventCollection;
	    	
	    	// events in that timeline need to be wiped out
	    	// from event collection...
	    	var eventHash = this.eventCollection.getTimelineHash(id)["all"];
	    	_.each(eventHash, function(ev_id) {
	    		evts.remove(ev_id);
	    	});
	    	
	    	
	    	this.timelineCollection.remove(tl_model);
	    	this.eventCollection.setTimelineHash(id, {});
	    	
	    	var callback = {
	    		fn: function() { alert("reloaded"); },
	    		toggle: true
	    	}
	    	
	    	// yes reload!
	    	this.loadTimelineData(source, callback, true);

	    },
	    
	    
	    drilldown: function(timeline_id) {
	    	
	    
	    },
	    
	    getScope : function () {
	    		     	
			var zi = this.getZoomInfo(),
				fd = this.getFocusDate(),
				tBounds = this.getActiveTimelinesBounds(),
				focusDateSec = Math.round(fd.sec),
				focus_unix_seconds = tg.TG_Date.TGSecToUnixSec(focusDateSec),
				width = this.dimensions.container.width,
				half_width = width/2,
				spp = Math.round(zi.spp),
			
				// calculate milliseconds from focus date seconds
				// and dimensions of the timeline frame
				left_ms = (focus_unix_seconds - (half_width * spp)) * 1000,
				focus_ms = focus_unix_seconds * 1000,
				right_ms = (focus_unix_seconds + (half_width * spp)) * 1000,
				
				left_sec = focusDateSec - (half_width * spp),
				right_sec = focusDateSec + (half_width * spp);
				
			var s = {
				"spp": spp, 
				"width": width,
				"focusDateSec": focusDateSec,
				"timelines": this.activeTimelines,
				"timelineBounds": tBounds,
				"container": $container,
				"left_sec":left_sec,
				"right_sec":right_sec,
				// unix milliseconds!
				"leftMS":left_ms,
				"rightMS":right_ms,
				"focusMS":focus_ms
			}
			
			this.scopeCache = s;
			
			return s;
			
	    },
	    
	    
	    /*
	     * fitToContainer
	     * Considers the time-width of the current timeline(s) and
	     * finds the best zoom level to fit all events in one view
	    */
	    fitToContainer: function() {
	    	
	    	var bds = this.getActiveTimelinesBounds();
	    	var seconds_wide = bds.last - bds.first;
	    	var middle_sec = (bds.first + bds.last) / 2;
	    	var width = this.dimensions.container.width;
	    	
	    	var z = _.find(tg.zoomTree, function (zl) {
	    		return seconds_wide/zl.spp < width;
	    	});

	    	this.gotoDateZoom(middle_sec, z.level);
	    		
	    },
	    
	    
	    resize: function () {
	    	$.publish(container_name + ".mediator.resize");
	    },
	    

	    addFilterAction: function(actionName, actionFilter, actionFunction) {
	    	this.filterActions[actionName] = {filter:actionFilter, fn:actionFunction};
	    	this.refresh();
	    },
	    
	    removeFilterAction: function(actionName) {
	    	delete this.filterActions[actionName];
	    	this.refresh();
	    },
	    
	    
	    getEventByID: function(id, prop) {
	    	var evob = this.eventCollection.get(id).attributes;
	    	
	    	if (prop && evob.hasOwnProperty(prop)) {
	    		return evob[prop];
	    	} else {
	    		return evob;
	    	}
	    },
	    
	    
	    
	    /*
	   	 * getPastEvents
	   	 * Get an array of all events prior to focus date
	   	 * @param visible_only {boolean} if true, only get events
	   	          with thresholds matching current zoom level
	   	 * @param out_of_frame {boolean} if true, only get events
	   	          to right of widget frame
	   	 *
	   	*/ 
		getPastEvents: function(visible_only, out_of_frame) {
	    	var me=this,
	    		scope = this.getScope(),
	    		getit = false;
	    	
	    	if (scope.timelineBounds.first < scope.focusDateSec) {
	    		
	    		// send back all events prior to focus
	    		var flred = _.filter(this.eventCollection.models, function(ev) {
	    		
	    			if (out_of_frame) {
	    				// only getting list of past events to left of frame
	    				if (ev.get("startdateObj").sec < scope.left_sec) {
	    					getit = true;
	    				}
	    			} else {
	    				getit = true;
	    			}
	    		
	    			var visf = (visible_only) ? me.isEventVisible(ev): true;
	    			var intx = _.intersection(me.activeTimelines, ev.get("timelines"));
 					
	    			return (getit && intx.length > 0 && visf && ev.get("startdateObj").sec < scope.focusDateSec);
	    		});
	    		
	    		
	    		return flred;
	    		
	    	} else {
	    		return false;
	    	}
		},
		
		
		/*
		* navigate to the next event that is to the left of the centerline/focus date
		* TODO move $() stuff to TimelineView
		*/
	   	gotoPreviousEvent: function() {

	    	if (this.activeTimelines.length == 0) {
	    		alert("No timelines are loaded.");
	    		return false;
	    	}
	    	
	    	var me=this,
	    		backEvents = this.getPastEvents(true, false);
								
			if (backEvents.length>0) {
				var cb = function(ev) {
					$(".timeglider-timeline-event").removeClass("tg-event-selected");
					$(".timeglider-timeline-event#" + ev.id).addClass("tg-event-selected");
				}
	    		this.focusToEvent(_.last(backEvents).attributes, cb);
	    	} else {
	    		alert("There are no events prior to this point");
	    		
	    		return false;
	    	}
	    },
	  
	  
	  
	    
	   	/*
	   	 * getFutureEvents
	   	 * Get an array of all events forward of focus date
	   	 * @param visible_only {boolean} if true, only get events
	   	          with thresholds matching current zoom level
	   	 * @param out_of_frame {boolean} if true, only get events
	   	          to right of widget frame
	   	 *
	   	*/ 
	    getFutureEvents: function (visible_only, out_of_frame) {
	    	var me=this,
	    		scope = this.getScope(),
	    		getit = false;
	    	
	
	    	if (scope.timelineBounds.last > scope.focusDateSec) {
				
	    		return _.filter(this.eventCollection.models, function(ev) {
	    		
	    			if (out_of_frame) {
	    				// only getting list of past events to left of frame
	    				if (ev.get("startdateObj").sec > scope.right_sec) {
	    					getit = true;
	    				}
	    			} else {
	    				getit = true;
	    			}

	    			var visf = (visible_only) ? me.isEventVisible(ev): true;
	    			var intx = _.intersection(me.activeTimelines, ev.get("timelines"));    		
	    			return (getit && intx.length > 0 && visf && ev.get("startdateObj").sec > scope.focusDateSec);

	    		});
	 
	    	} else {
	    		return false;
	    	}
	    },
	    
	    
	    
		gotoNextEvent: function() {
		
			
	    	if (this.activeTimelines.length == 0) {
	    		alert("No timelines are loaded.");
	    		return false;
	    	}
	    	
			var me = this,
				fwdEvents = this.getFutureEvents(true, false);
			
						
			if (fwdEvents.length > 0) {
				var cb = function(ev) {
					$(".timeglider-timeline-event").removeClass("tg-event-selected");
					$(".timeglider-timeline-event#" + ev.id).addClass("tg-event-selected");
				}
				this.focusToEvent(_.first(fwdEvents).attributes, cb);
			} else {
			
				alert("There are no events farther ahead of this point.");
				return false;
				
			}
		},
	    
	   
	   
		isEventVisible: function(ev) {
			
			var z = this._zoomLevel;
			
			if (z <= ev.get("high_threshold") && z >= ev.get("low_threshold")) {
				return true;
			} else {
				return false;
			}
			
		},
		
		

	    
	    /* 
	     * adjustNowEvents
	     * Keeps events with "keepCurrent" set to "start" or "end" up to
	     * date with current time, useful for real-time timelines with
	     * sensitive auto-adjusting event times. Automatically searches
	     * all events in the collection.
	     * NO PARAMS
	     *
	     */
	    adjustNowEvents: function() {
	    	
	    	var refresh = false,
	    		kC = "",
	    		dd = "";
	    	
	    	_.each(this.eventCollection.models, function(ev) {
	    		if (ev.get("keepCurrent")) {
	    			
	    			kC = ev.get("keepCurrent"),
	    			dd = ev.get("date_display");
	    			
	    			if (kC == "start") {
	    				ev.set({"startdateObj":new TG_Date("today", dd)});
	    			} else if (kC == "end") {
	    				ev.set({"enddateObj":new TG_Date("today", dd)});
	    			}
	    			
	    			ev.reIndex();
	    			
	    			refresh = true;
	    	
	    		}
	    	});
	    
	    	if (refresh) {
	    		this.refresh();
	    	}
	    },
	    
	    
	    
	    
	    
	    
	    /*
	     * addEvent
	     * @param new_event {Object} is a simple tg event object
	     *        with .startdate and .enddate as ISO8601 strings,
	     *        and would accept other TG_Event attribs
	     * @param refresh {Boolean} true to refresh the timeline
	     *        view; false in case a batch of events is being
	     *        loaded to prevent pointless refreshes
	     *	
	     * @return the new (Backbone) Model for the event
	     *
	    */
	    addEvent: function(new_event,refresh) {
	    	
	    	refresh = refresh || false;
	    	
			new_event.startdateObj = new tg.TG_Date(new_event.startdate);
			
			var enddate = new_event.enddate || new_event.startdate;
			
			new_event.enddateObj = new tg.TG_Date(enddate);

			new_event.mediator = this;
			
			new_event.cache = {
				timelines:new_event.timelines,
				startdateObj:new_event.startdateObj,
				enddateObj:new_event.enddateObj,
				span:true
			}
			
			var new_model = new tg.TG_Event(new_event);
			
			this.eventCollection.add(new_model);
			
			// incorporates TG_Event into hashes, re-evaluates
			// timeline start/end points
			new_model.reIndex();
			
			
			if (refresh) {
				this.refresh();
			}
			
	    	$.publish(container_name + ".mediator.addEvent"); 

	    	return new_model;
	    
	    },
	    
	    
	    
	    
	    
	    /*
	     * updateEvent
	     * @param event_edits {Object} is a 
	     *	
	     * @return the new (Backbone) Model for the event
	     *
	    */
	    updateEvent:function (event_edits) {
	    
	    	if (!event_edits.id) {
	    		alert("error: you need a valid id set on the object in updateEvent()");
	    		return false;
	    	}
	    	
	    	var ev = this.eventCollection.get(event_edits.id);
	    	
	    	ev.set(event_edits);
	    	
	    	// re-index if dates have changed
	    	if (event_edits.startdateObject || event_edits.enddateObject) {
	    		ev.reIndex();
	    	}

	    	this.refresh();
	    	
	    	$.publish(container_name + ".mediator.updateEvent"); 
	    	
	    	return ev;

	    },
	    
	    
	    /*
	     * Gets the bounds for 1+ timelines in view
	     */
	    getActiveTimelinesBounds: function() {
	    	
	    	var active = this.activeTimelines,
	    		tl = {},
	    		startSec = 99999999999,
	    		endSec = 0;
	    	
	    	for (var t=0; t<active.length; t++) {
	    		tl = this.timelineCollection.get(active[t]);
	    		startSec = (tl.get("bounds").first < startSec) ? tl.get("bounds").first : startSec;
	    		endSec = (tl.get("bounds").last > endSec) ? tl.get("bounds").last : endSec;
	    	}
	    	
			return {"first":startSec, "last":endSec};
	    
	    },
	    
	    
	    
	    
    removeFromActive: function (timeline_id) {
    	var active = _.indexOf(this.activeTimelines,timeline_id);
    	
    	// if it's in the active array
    	if (active != -1) {
			this.activeTimelines.splice(active,1);
			return true;
		} else {
			return false;
		}
		
    },
    
    
    
	/*
	* loadTimelineData
	* @param src {object} object OR json data to be parsed for loading
	* !TODO: create option for XML?
	*/
	loadTimelineData : function (src, callback, reload) {
		
		var reload = reload || false;
		
		var M = this; // model ref
		// Allow to pass in either the url for the data or the data itself.

		if (src) {

			// if we've not loaded it already!
			if (_.indexOf(M.loadedSources, src) == -1 || reload == true) {
							
			    if (typeof src === "object") {
			    
					// OBJECT (already loaded, created)
					M.parseTimelineData(src, callback);
			      
			    } else if (src.substr(0,1) == "#") {
					// TABLE
					var tableData = [M.getTableTimelineData(src)];
					M.parseTimelineData(tableData);
			      
			    } else {
			    	/*
			    				    	
					$.ajax({
					  url: src,
					  type: "GET",
					  cache: false,
					  dataType: "json",
					  
					  error: function (jqXHR, textStatus, errorThrown) {
					  	debug.log("loadTimelineData json error:", JSON.stringify(jqXHR), JSON.stringify(textStatus), errorThrown);
					  },
					  	
					  success: function (data) {
			        	
			        	if (data.error) {
			        		if (data.password_required == 1) {
			        			// set up a password field!
			        			alert("This presentation requires a password. Here at Timeglider, we're rebuilding our presentation system. Come back soon!");
			        			
			        		} else {
			        			// some other kind of error
			        			alert(data.error);
			        		}
			        		return false;
			        	} else {
			        		console.log(data);
			        		M.parseTimelineData(data, callback);
			        	}	
			       	 }
					});
*/
data = [
{
    "id": "jshist",
    "title": "Africa Lead Timeline",
    "focus_date": "2011-1-1 0:00:00",
    "initial_zoom": "26",
    "timezone": "-05:00",
    "events": 
[
  {
    "id":40552,
    "title":"ASSESSMENTS",
    "description":"ASSESSMENTS",
    "startdate":"2011-1-1 0:00:00",
    "enddate":"2011-1-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":100,
    "icon":""
  },
  {
    "id":40553,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-1-10 0:00:00",
    "enddate":"2011-1-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40560,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-1-17 0:00:00",
    "enddate":"2011-1-17 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40567,
    "title":"Ghana",
    "description":"Ghana",
    "startdate":"2011-1-24 0:00:00",
    "enddate":"2011-1-24 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40567,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-1-24 0:00:00",
    "enddate":"2011-1-24 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40574,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-1-31 0:00:00",
    "enddate":"2011-1-31 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40581,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-2-7 0:00:00",
    "enddate":"2011-2-7 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40588,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-2-14 0:00:00",
    "enddate":"2011-2-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40588,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-2-14 0:00:00",
    "enddate":"2011-2-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40595,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-2-21 0:00:00",
    "enddate":"2011-2-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40595,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-2-21 0:00:00",
    "enddate":"2011-2-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40602,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-2-28 0:00:00",
    "enddate":"2011-2-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40602,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-2-28 0:00:00",
    "enddate":"2011-2-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40609,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-7 0:00:00",
    "enddate":"2011-3-7 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40609,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-7 0:00:00",
    "enddate":"2011-3-7 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40616,
    "title":"Ghana",
    "description":"Ghana",
    "startdate":"2011-3-14 0:00:00",
    "enddate":"2011-3-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40616,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-14 0:00:00",
    "enddate":"2011-3-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40623,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-3-21 0:00:00",
    "enddate":"2011-3-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40623,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-3-21 0:00:00",
    "enddate":"2011-3-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40623,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-21 0:00:00",
    "enddate":"2011-3-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40623,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-21 0:00:00",
    "enddate":"2011-3-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40630,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-3-28 0:00:00",
    "enddate":"2011-3-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40630,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-3-28 0:00:00",
    "enddate":"2011-3-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40630,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-28 0:00:00",
    "enddate":"2011-3-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40630,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-3-28 0:00:00",
    "enddate":"2011-3-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40630,
    "title":"Pretoria",
    "description":"Pretoria",
    "startdate":"2011-3-28 0:00:00",
    "enddate":"2011-3-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40634,
    "title":" Support is provided to Cuttington University Agriculture Show in Liberia",
    "description":" Support is provided to Cuttington University Agriculture Show in Liberia",
    "startdate":"2011-4-1 0:00:00",
    "enddate":"2011-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40637,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-4-4 0:00:00",
    "enddate":"2011-4-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40637,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-4-4 0:00:00",
    "enddate":"2011-4-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40637,
    "title":"Pretoria",
    "description":"Pretoria",
    "startdate":"2011-4-4 0:00:00",
    "enddate":"2011-4-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40644,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-4-11 0:00:00",
    "enddate":"2011-4-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40644,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-4-11 0:00:00",
    "enddate":"2011-4-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40664,
    "title":"TAFSIP Steering Committee Assessment",
    "description":"TAFSIP Steering Committee Assessment",
    "startdate":"2011-5-1 0:00:00",
    "enddate":"2011-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40664,
    "title":"CORAF Assessment ",
    "description":"CORAF Assessment ",
    "startdate":"2011-5-1 0:00:00",
    "enddate":"2011-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40664,
    "title":"4 ECOWAS Institutions Assessments",
    "description":"4 ECOWAS Institutions Assessments",
    "startdate":"2011-5-1 0:00:00",
    "enddate":"2011-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40665,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-5-2 0:00:00",
    "enddate":"2011-5-2 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40672,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-5-9 0:00:00",
    "enddate":"2011-5-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40672,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-5-9 0:00:00",
    "enddate":"2011-5-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40672,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-5-9 0:00:00",
    "enddate":"2011-5-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40672,
    "title":"Pretoria",
    "description":"Pretoria",
    "startdate":"2011-5-9 0:00:00",
    "enddate":"2011-5-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40679,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-5-16 0:00:00",
    "enddate":"2011-5-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40679,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-5-16 0:00:00",
    "enddate":"2011-5-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40679,
    "title":"Sponsored 2 participants for Animal Health Course in US",
    "description":"Sponsored 2 participants for Animal Health Course in US",
    "startdate":"2011-5-16 0:00:00",
    "enddate":"2011-5-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":70,
    "icon":""
  },
  {
    "id":40693,
    "title":"Accra",
    "description":"Accra",
    "startdate":"2011-5-30 0:00:00",
    "enddate":"2011-5-30 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40693,
    "title":"Pretoria",
    "description":"Pretoria",
    "startdate":"2011-5-30 0:00:00",
    "enddate":"2011-5-30 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40695,
    "title":"Ghana METASIP Steering Committee Assessment ",
    "description":"Ghana METASIP Steering Committee Assessment ",
    "startdate":"2011-6-1 0:00:00",
    "enddate":"2011-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40695,
    "title":"CILSS Assessment ",
    "description":"CILSS Assessment ",
    "startdate":"2011-6-1 0:00:00",
    "enddate":"2011-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40728,
    "title":"Pretoria",
    "description":"Pretoria",
    "startdate":"2011-7-4 0:00:00",
    "enddate":"2011-7-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40728,
    "title":"Sponsored 13 participants for Int'l Fertilizer Development Center Training ",
    "description":"Sponsored 13 participants for Int'l Fertilizer Development Center Training ",
    "startdate":"2011-7-4 0:00:00",
    "enddate":"2011-7-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40756,
    "title":"Tanzania Horticultural Association Assessment",
    "description":"Tanzania Horticultural Association Assessment",
    "startdate":"2011-8-1 0:00:00",
    "enddate":"2011-8-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40771,
    "title":"NSA Zimbabwe",
    "description":"NSA Zimbabwe",
    "startdate":"2011-8-16 0:00:00",
    "enddate":"2011-8-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40777,
    "title":"Sponsored 2 participants for veterinary Epidemiology Course in US",
    "description":"Sponsored 2 participants for veterinary Epidemiology Course in US",
    "startdate":"2011-8-22 0:00:00",
    "enddate":"2011-8-22 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40781,
    "title":"Sponsored 9 for Climate Smart Agriculture planning meeting",
    "description":"Sponsored 9 for Climate Smart Agriculture planning meeting",
    "startdate":"2011-8-26 0:00:00",
    "enddate":"2011-8-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40787,
    "title":"Uganda Meta-Assessment ",
    "description":"Uganda Meta-Assessment ",
    "startdate":"2011-9-1 0:00:00",
    "enddate":"2011-9-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40791,
    "title":"NSA Zambia",
    "description":"NSA Zambia",
    "startdate":"2011-9-5 0:00:00",
    "enddate":"2011-9-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40798,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-9-12 0:00:00",
    "enddate":"2011-9-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40805,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2011-9-19 0:00:00",
    "enddate":"2011-9-19 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40805,
    "title":"Nairobi",
    "description":"Nairobi",
    "startdate":"2011-9-19 0:00:00",
    "enddate":"2011-9-19 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40805,
    "title":"Sponsored 1 participant Int'l Animal Disease Training",
    "description":"Sponsored 1 participant Int'l Animal Disease Training",
    "startdate":"2011-9-19 0:00:00",
    "enddate":"2011-9-19 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40812,
    "title":"Sponsored 3 to Agricultural Society of Kenya",
    "description":"Sponsored 3 to Agricultural Society of Kenya",
    "startdate":"2011-9-26 0:00:00",
    "enddate":"2011-9-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40814,
    "title":"Sponsored 2 in Malawi CAADP Business Meeting",
    "description":"Sponsored 2 in Malawi CAADP Business Meeting",
    "startdate":"2011-9-28 0:00:00",
    "enddate":"2011-9-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40820,
    "title":"NSA Ethiopia",
    "description":"NSA Ethiopia",
    "startdate":"2011-10-4 0:00:00",
    "enddate":"2011-10-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40823,
    "title":"Sponsored 3 Participants for FAGRO/AGRIFA",
    "description":"Sponsored 3 Participants for FAGRO/AGRIFA",
    "startdate":"2011-10-7 0:00:00",
    "enddate":"2011-10-7 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40826,
    "title":"Supported FTF M&E Workshop",
    "description":"Supported FTF M&E Workshop",
    "startdate":"2011-10-10 0:00:00",
    "enddate":"2011-10-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40827,
    "title":"NSA Senegal",
    "description":"NSA Senegal",
    "startdate":"2011-10-11 0:00:00",
    "enddate":"2011-10-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40835,
    "title":"NSA Ghana",
    "description":"NSA Ghana",
    "startdate":"2011-10-19 0:00:00",
    "enddate":"2011-10-19 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40840,
    "title":"Tanzania",
    "description":"Tanzania",
    "startdate":"2011-10-24 0:00:00",
    "enddate":"2011-10-24 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40840,
    "title":"Supported Climate Smart Conference",
    "description":"Supported Climate Smart Conference",
    "startdate":"2011-10-24 0:00:00",
    "enddate":"2011-10-24 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40847,
    "title":"NSA Uganda",
    "description":"NSA Uganda",
    "startdate":"2011-10-31 0:00:00",
    "enddate":"2011-10-31 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40848,
    "title":"Supported IFPRI Conference ",
    "description":"Supported IFPRI Conference ",
    "startdate":"2011-11-1 0:00:00",
    "enddate":"2011-11-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40850,
    "title":"Uganda",
    "description":"Uganda",
    "startdate":"2011-11-3 0:00:00",
    "enddate":"2011-11-3 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40855,
    "title":"NSA Kenya",
    "description":"NSA Kenya",
    "startdate":"2011-11-8 0:00:00",
    "enddate":"2011-11-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40855,
    "title":"Supported GROW Africa Forum ",
    "description":"Supported GROW Africa Forum ",
    "startdate":"2011-11-8 0:00:00",
    "enddate":"2011-11-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40856,
    "title":"Sponsored 9 Participants WA CAADP Nutrition Workshop",
    "description":"Sponsored 9 Participants WA CAADP Nutrition Workshop",
    "startdate":"2011-11-9 0:00:00",
    "enddate":"2011-11-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40862,
    "title":"NSA Rwanda",
    "description":"NSA Rwanda",
    "startdate":"2011-11-15 0:00:00",
    "enddate":"2011-11-15 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40868,
    "title":"Zambia",
    "description":"Zambia",
    "startdate":"2011-11-21 0:00:00",
    "enddate":"2011-11-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40868,
    "title":"Zambia",
    "description":"Zambia",
    "startdate":"2011-11-21 0:00:00",
    "enddate":"2011-11-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40883,
    "title":"NSA Tanzania",
    "description":"NSA Tanzania",
    "startdate":"2011-12-6 0:00:00",
    "enddate":"2011-12-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40878,
    "title":" 9 South African Resources Institutions Assessments",
    "description":" 9 South African Resources Institutions Assessments",
    "startdate":"2011-12-1 0:00:00",
    "enddate":"2011-12-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40889,
    "title":"Sponsored 2 for Proposal Writing ARC Training",
    "description":"Sponsored 2 for Proposal Writing ARC Training",
    "startdate":"2011-12-12 0:00:00",
    "enddate":"2011-12-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40890,
    "title":"NSA Ghana",
    "description":"NSA Ghana",
    "startdate":"2011-12-13 0:00:00",
    "enddate":"2011-12-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40891,
    "title":"TRAININGS",
    "description":"TRAININGS",
    "startdate":"2012-1-1 0:00:00",
    "enddate":"2012-1-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":100,
    "icon":""
  },
  {
    "id":40545,
    "title":"Training-of-Trainers Sessions take place in Fall 2010",
    "description":"Training-of-Trainers Sessions take place in Fall 2010",
    "startdate":"2011-1-2 0:00:00",
    "enddate":"2011-1-2 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40545,
    "title":"Work Begins on populating database of relevant technical and Management Courses",
    "description":"Work Begins on populating database of relevant technical and Management Courses",
    "startdate":"2011-1-2 0:00:00",
    "enddate":"2011-1-2 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40909,
    "title":"20 Agricultural Institutions in Northern Ghana Assessments",
    "description":"20 Agricultural Institutions in Northern Ghana Assessments",
    "startdate":"2012-1-1 0:00:00",
    "enddate":"2012-1-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40913,
    "title":"Stocking Taking Meeting Held ",
    "description":"Stocking Taking Meeting Held ",
    "startdate":"2012-1-5 0:00:00",
    "enddate":"2012-1-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40938,
    "title":"Zimbabwe",
    "description":"Zimbabwe",
    "startdate":"2012-1-30 0:00:00",
    "enddate":"2012-1-30 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40940,
    "title":"One Intern sent to Hershey Co. in US",
    "description":"One Intern sent to Hershey Co. in US",
    "startdate":"2012-2-1 0:00:00",
    "enddate":"2012-2-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40940,
    "title":"COMESA/ ACTESA (2 Rounds) Assessment",
    "description":"COMESA/ ACTESA (2 Rounds) Assessment",
    "startdate":"2012-2-1 0:00:00",
    "enddate":"2012-2-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40953,
    "title":"Zambia",
    "description":"Zambia",
    "startdate":"2012-2-14 0:00:00",
    "enddate":"2012-2-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40960,
    "title":"NSA Mali",
    "description":"NSA Mali",
    "startdate":"2012-2-21 0:00:00",
    "enddate":"2012-2-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40961,
    "title":"NSA Liberia ",
    "description":"NSA Liberia ",
    "startdate":"2012-2-22 0:00:00",
    "enddate":"2012-2-22 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40969,
    "title":"1 Intern sent to Joburg  Stock Exchange ",
    "description":"1 Intern sent to Joburg  Stock Exchange ",
    "startdate":"2012-3-1 0:00:00",
    "enddate":"2012-3-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":40969,
    "title":"Supported Cuttington Univ Ag Show ",
    "description":"Supported Cuttington Univ Ag Show ",
    "startdate":"2012-3-1 0:00:00",
    "enddate":"2012-3-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":40980,
    "title":"Zimbabwe",
    "description":"Zimbabwe",
    "startdate":"2012-3-12 0:00:00",
    "enddate":"2012-3-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":40995,
    "title":"Accra ",
    "description":"Accra ",
    "startdate":"2012-3-27 0:00:00",
    "enddate":"2012-3-27 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41001,
    "title":"Accra ",
    "description":"Accra ",
    "startdate":"2012-4-2 0:00:00",
    "enddate":"2012-4-2 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41015,
    "title":"Zambia",
    "description":"Zambia",
    "startdate":"2012-4-16 0:00:00",
    "enddate":"2012-4-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41023,
    "title":"Monrovia",
    "description":"Monrovia",
    "startdate":"2012-4-24 0:00:00",
    "enddate":"2012-4-24 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41029,
    "title":"Monrovia ",
    "description":"Monrovia ",
    "startdate":"2012-4-30 0:00:00",
    "enddate":"2012-4-30 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41030,
    "title":"1 Intern sent to Joburg  Stock Exchange ",
    "description":"1 Intern sent to Joburg  Stock Exchange ",
    "startdate":"2012-5-1 0:00:00",
    "enddate":"2012-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41030,
    "title":"CORAF RBM Training ",
    "description":"CORAF RBM Training ",
    "startdate":"2012-5-1 0:00:00",
    "enddate":"2012-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41043,
    "title":"Zimbabwe",
    "description":"Zimbabwe",
    "startdate":"2012-5-14 0:00:00",
    "enddate":"2012-5-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41044,
    "title":"Accra ",
    "description":"Accra ",
    "startdate":"2012-5-15 0:00:00",
    "enddate":"2012-5-15 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41061,
    "title":"5 SUA Interns begin",
    "description":"5 SUA Interns begin",
    "startdate":"2012-6-1 0:00:00",
    "enddate":"2012-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41061,
    "title":"Sponsored 18 MOFA/PPMED Staff to M&E course ",
    "description":"Sponsored 18 MOFA/PPMED Staff to M&E course ",
    "startdate":"2012-6-1 0:00:00",
    "enddate":"2012-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41061,
    "title":"Ethiopia & Rwanda CAADP NAIPs Case Study ",
    "description":"Ethiopia & Rwanda CAADP NAIPs Case Study ",
    "startdate":"2012-6-1 0:00:00",
    "enddate":"2012-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41061,
    "title":"SARI Ghana Assessment ",
    "description":"SARI Ghana Assessment ",
    "startdate":"2012-6-1 0:00:00",
    "enddate":"2012-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41064,
    "title":"Zimbabwe",
    "description":"Zimbabwe",
    "startdate":"2012-6-4 0:00:00",
    "enddate":"2012-6-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41065,
    "title":"Monrovia",
    "description":"Monrovia",
    "startdate":"2012-6-5 0:00:00",
    "enddate":"2012-6-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41071,
    "title":"CILSS Leadership Training ",
    "description":"CILSS Leadership Training ",
    "startdate":"2012-6-11 0:00:00",
    "enddate":"2012-6-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41073,
    "title":"High Level Session - Zimbabwe ",
    "description":"High Level Session - Zimbabwe ",
    "startdate":"2012-6-13 0:00:00",
    "enddate":"2012-6-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41073,
    "title":"CILSS RBM Training",
    "description":"CILSS RBM Training",
    "startdate":"2012-6-13 0:00:00",
    "enddate":"2012-6-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41078,
    "title":" Sponsored 24 participants for Uganda's Cassava Conf",
    "description":" Sponsored 24 participants for Uganda's Cassava Conf",
    "startdate":"2012-6-18 0:00:00",
    "enddate":"2012-6-18 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41456,
    "title":"Lessons Learned Field Work begins ",
    "description":"Lessons Learned Field Work begins ",
    "startdate":"2013-7-1 0:00:00",
    "enddate":"2013-7-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41093,
    "title":"CORAF Leadership Training ",
    "description":"CORAF Leadership Training ",
    "startdate":"2012-7-3 0:00:00",
    "enddate":"2012-7-3 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41095,
    "title":"CORAF RBM Training ",
    "description":"CORAF RBM Training ",
    "startdate":"2012-7-5 0:00:00",
    "enddate":"2012-7-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41099,
    "title":"Sponsored 1 for Impact Eval for Evidence-Based Policy",
    "description":"Sponsored 1 for Impact Eval for Evidence-Based Policy",
    "startdate":"2012-7-9 0:00:00",
    "enddate":"2012-7-9 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41116,
    "title":"Sponsored 3 for San Fran Leadership Challenges Forum",
    "description":"Sponsored 3 for San Fran Leadership Challenges Forum",
    "startdate":"2012-7-26 0:00:00",
    "enddate":"2012-7-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41122,
    "title":"Six interns for CILSS one year placement ",
    "description":"Six interns for CILSS one year placement ",
    "startdate":"2012-8-1 0:00:00",
    "enddate":"2012-8-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41122,
    "title":"One Sponsored for Vet Epi Course in US",
    "description":"One Sponsored for Vet Epi Course in US",
    "startdate":"2012-8-1 0:00:00",
    "enddate":"2012-8-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41127,
    "title":"Kenya",
    "description":"Kenya",
    "startdate":"2012-8-6 0:00:00",
    "enddate":"2012-8-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41127,
    "title":"CORAF Human Resource Training ",
    "description":"CORAF Human Resource Training ",
    "startdate":"2012-8-6 0:00:00",
    "enddate":"2012-8-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41129,
    "title":"CILSS M&E System Training ",
    "description":"CILSS M&E System Training ",
    "startdate":"2012-8-8 0:00:00",
    "enddate":"2012-8-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41135,
    "title":"4 Interns for CORAF one year placement ",
    "description":"4 Interns for CORAF one year placement ",
    "startdate":"2012-8-14 0:00:00",
    "enddate":"2012-8-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41146,
    "title":"Supported 1 to Travel with Ugandan Legislators to U.S.A",
    "description":"Supported 1 to Travel with Ugandan Legislators to U.S.A",
    "startdate":"2012-8-25 0:00:00",
    "enddate":"2012-8-25 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41155,
    "title":"Uganda ",
    "description":"Uganda ",
    "startdate":"2012-9-3 0:00:00",
    "enddate":"2012-9-3 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41158,
    "title":"Supported G8 Tanzania Conf",
    "description":"Supported G8 Tanzania Conf",
    "startdate":"2012-9-6 0:00:00",
    "enddate":"2012-9-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41162,
    "title":"CILSS Human Resources Training ",
    "description":"CILSS Human Resources Training ",
    "startdate":"2012-9-10 0:00:00",
    "enddate":"2012-9-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41164,
    "title":"Supported G8 Ethiopia Conference",
    "description":"Supported G8 Ethiopia Conference",
    "startdate":"2012-9-12 0:00:00",
    "enddate":"2012-9-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41165,
    "title":"CILSS Comms training ",
    "description":"CILSS Comms training ",
    "startdate":"2012-9-13 0:00:00",
    "enddate":"2012-9-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41171,
    "title":"CORAF M&E System training",
    "description":"CORAF M&E System training",
    "startdate":"2012-9-19 0:00:00",
    "enddate":"2012-9-19 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41178,
    "title":"Sponsored  1 to  travel to the US for FTF Panel",
    "description":"Sponsored  1 to  travel to the US for FTF Panel",
    "startdate":"2012-9-26 0:00:00",
    "enddate":"2012-9-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41183,
    "title":"Nigeria Ag Transform Agenda Assessment",
    "description":"Nigeria Ag Transform Agenda Assessment",
    "startdate":"2012-10-1 0:00:00",
    "enddate":"2012-10-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41186,
    "title":"Supported G2G Tanzania Conf",
    "description":"Supported G2G Tanzania Conf",
    "startdate":"2012-10-4 0:00:00",
    "enddate":"2012-10-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41190,
    "title":"1 Intern sent to Joburg  Stock Exchange ",
    "description":"1 Intern sent to Joburg  Stock Exchange ",
    "startdate":"2012-10-8 0:00:00",
    "enddate":"2012-10-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41190,
    "title":"Supported  EAC Aflatoxin Conf",
    "description":"Supported  EAC Aflatoxin Conf",
    "startdate":"2012-10-8 0:00:00",
    "enddate":"2012-10-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41196,
    "title":"Supported ACSU / GOK Conf",
    "description":"Supported ACSU / GOK Conf",
    "startdate":"2012-10-14 0:00:00",
    "enddate":"2012-10-14 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41199,
    "title":"CILSS Management Training ",
    "description":"CILSS Management Training ",
    "startdate":"2012-10-17 0:00:00",
    "enddate":"2012-10-17 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41211,
    "title":"Senegal",
    "description":"Senegal",
    "startdate":"2012-10-29 0:00:00",
    "enddate":"2012-10-29 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41211,
    "title":"Supported  EAC Nairobi Conf",
    "description":"Supported  EAC Nairobi Conf",
    "startdate":"2012-10-29 0:00:00",
    "enddate":"2012-10-29 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41218,
    "title":"1 Intern sent to Joburg  Stock Exchange ",
    "description":"1 Intern sent to Joburg  Stock Exchange ",
    "startdate":"2012-11-5 0:00:00",
    "enddate":"2012-11-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41218,
    "title":"Supported Global Alliance Ethiopia conf",
    "description":"Supported Global Alliance Ethiopia conf",
    "startdate":"2012-11-5 0:00:00",
    "enddate":"2012-11-5 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41221,
    "title":" Supported Global Alliance Kenya Conf",
    "description":" Supported Global Alliance Kenya Conf",
    "startdate":"2012-11-8 0:00:00",
    "enddate":"2012-11-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41225,
    "title":"Sponsored speaker for U.S.-Africa Agribusiness Invest Forum",
    "description":"Sponsored speaker for U.S.-Africa Agribusiness Invest Forum",
    "startdate":"2012-11-12 0:00:00",
    "enddate":"2012-11-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41214,
    "title":"3 Interns sent to Zamindari Farm Solutions ",
    "description":"3 Interns sent to Zamindari Farm Solutions ",
    "startdate":"2012-11-1 0:00:00",
    "enddate":"2012-11-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41225,
    "title":"CILSS RBM Training",
    "description":"CILSS RBM Training",
    "startdate":"2012-11-12 0:00:00",
    "enddate":"2012-11-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41229,
    "title":"CILSS Proposal Training ",
    "description":"CILSS Proposal Training ",
    "startdate":"2012-11-16 0:00:00",
    "enddate":"2012-11-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41239,
    "title":"CORAF Board Training ",
    "description":"CORAF Board Training ",
    "startdate":"2012-11-26 0:00:00",
    "enddate":"2012-11-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41241,
    "title":"Sponsored FTF Partners Meeting ",
    "description":"Sponsored FTF Partners Meeting ",
    "startdate":"2012-11-28 0:00:00",
    "enddate":"2012-11-28 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41253,
    "title":"CORAF Proposal Training ",
    "description":"CORAF Proposal Training ",
    "startdate":"2012-12-10 0:00:00",
    "enddate":"2012-12-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41255,
    "title":"CORAF Report Writing Training",
    "description":"CORAF Report Writing Training",
    "startdate":"2012-12-12 0:00:00",
    "enddate":"2012-12-12 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41260,
    "title":"CILSS Evaluation Training ",
    "description":"CILSS Evaluation Training ",
    "startdate":"2012-12-17 0:00:00",
    "enddate":"2012-12-17 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41263,
    "title":"CILSS Report Writing Training ",
    "description":"CILSS Report Writing Training ",
    "startdate":"2012-12-20 0:00:00",
    "enddate":"2012-12-20 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41270,
    "title":"CONFERNECES",
    "description":"CONFERENCES",
    "startdate":"2013-1-1 0:00:00",
    "enddate":"2013-1-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":100,
    "icon":""
  },
  {
    "id":41306,
    "title":"Niger HC3N Capacity Assessment",
    "description":"Niger HC3N Capacity Assessment",
    "startdate":"2013-2-1 0:00:00",
    "enddate":"2013-2-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41323,
    "title":"CILSS Comms Training ",
    "description":"CILSS Comms Training ",
    "startdate":"2013-2-18 0:00:00",
    "enddate":"2013-2-18 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41330,
    "title":"Supported NEPAD CAADP Nutrition Conf",
    "description":"Supported NEPAD CAADP Nutrition Conf",
    "startdate":"2013-2-25 0:00:00",
    "enddate":"2013-2-25 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41331,
    "title":"Supported JSE AFM Conference ",
    "description":"Supported JSE AFM Conference ",
    "startdate":"2013-2-26 0:00:00",
    "enddate":"2013-2-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41334,
    "title":"Supported ECOWAS Donor mapping Exercise",
    "description":"Supported ECOWAS Donor mapping Exercise",
    "startdate":"2013-3-1 0:00:00",
    "enddate":"2013-3-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41344,
    "title":"Tanzania ",
    "description":"Tanzania ",
    "startdate":"2013-3-11 0:00:00",
    "enddate":"2013-3-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41351,
    "title":"Mod 1 & 2 - Ghana",
    "description":"Mod 1 & 2 - Ghana",
    "startdate":"2013-3-18 0:00:00",
    "enddate":"2013-3-18 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41355,
    "title":"USDA- USA TOUR",
    "description":"USDA- USA TOUR",
    "startdate":"2013-3-22 0:00:00",
    "enddate":"2013-3-22 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41365,
    "title":"Sponsored 9 SUA Interns ",
    "description":"Sponsored 9 SUA Interns ",
    "startdate":"2013-4-1 0:00:00",
    "enddate":"2013-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41365,
    "title":"Supported Economic Growth Partners Meeting in Zanzibar",
    "description":"Supported Economic Growth Partners Meeting in Zanzibar",
    "startdate":"2013-4-1 0:00:00",
    "enddate":"2013-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41365,
    "title":"6 FTF Country Agriculture Policy Assessments Start",
    "description":"6 FTF Country Agriculture Policy Assessments Start",
    "startdate":"2013-4-1 0:00:00",
    "enddate":"2013-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41365,
    "title":"ECOWAS Climate Change Assessment",
    "description":"ECOWAS Climate Change Assessment",
    "startdate":"2013-4-1 0:00:00",
    "enddate":"2013-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41386,
    "title":"Kenya ",
    "description":"Kenya ",
    "startdate":"2013-4-22 0:00:00",
    "enddate":"2013-4-22 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41393,
    "title":"Tanzania",
    "description":"Tanzania",
    "startdate":"2013-4-29 0:00:00",
    "enddate":"2013-4-29 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41395,
    "title":"3 Interns sent to Zamindari Farm Solutions ",
    "description":"3 Interns sent to Zamindari Farm Solutions ",
    "startdate":"2013-5-1 0:00:00",
    "enddate":"2013-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41395,
    "title":"Sponsored Global Learning & Evidence Exchange",
    "description":"Sponsored Global Learning & Evidence Exchange",
    "startdate":"2013-5-1 0:00:00",
    "enddate":"2013-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41395,
    "title":"Supported APLE - Agricultural Policy Exchange and Learning Event",
    "description":"Supported APLE - Agricultural Policy Exchange and Learning Event",
    "startdate":"2013-5-1 0:00:00",
    "enddate":"2013-5-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41426,
    "title":"EBID/ECOWAS Bank For Inter dev Capacity & IT assessment",
    "description":"EBID/ECOWAS Bank For Inter dev Capacity & IT assessment",
    "startdate":"2013-6-1 0:00:00",
    "enddate":"2013-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41410,
    "title":"Uganda",
    "description":"Uganda",
    "startdate":"2013-5-16 0:00:00",
    "enddate":"2013-5-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41414,
    "title":"Rwanda",
    "description":"Rwanda",
    "startdate":"2013-5-20 0:00:00",
    "enddate":"2013-5-20 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41415,
    "title":"Tanzania",
    "description":"Tanzania",
    "startdate":"2013-5-21 0:00:00",
    "enddate":"2013-5-21 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41400,
    "title":"Mod 1 &2 - Ghana",
    "description":"Mod 1 &2 - Ghana",
    "startdate":"2013-5-6 0:00:00",
    "enddate":"2013-5-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41426,
    "title":"I Intern sent to Uncle Ben's Internship in US",
    "description":"I Intern sent to Uncle Ben's Internship in US",
    "startdate":"2013-6-1 0:00:00",
    "enddate":"2013-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41426,
    "title":"Supported Governors' Agricultural Sector Forum",
    "description":"Supported Governors' Agricultural Sector Forum",
    "startdate":"2013-6-1 0:00:00",
    "enddate":"2013-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41426,
    "title":"Supported FTF Partners meeting ",
    "description":"Supported FTF Partners meeting ",
    "startdate":"2013-6-1 0:00:00",
    "enddate":"2013-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41426,
    "title":"Sponsored Participants  for Potatoes Conference",
    "description":"Sponsored Participants  for Potatoes Conference",
    "startdate":"2013-6-1 0:00:00",
    "enddate":"2013-6-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41456,
    "title":"High Level Module 1 for Tanzania parliamentarians",
    "description":"High Level Module 1 for Tanzania parliamentarians",
    "startdate":"2013-7-1 0:00:00",
    "enddate":"2013-7-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41456,
    "title":"IFDC Field Trip to USA - Zambian",
    "description":"IFDC Field Trip to USA - Zambian",
    "startdate":"2013-7-1 0:00:00",
    "enddate":"2013-7-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41372,
    "title":"Mod 1&2 - Ghana",
    "description":"Mod 1&2 - Ghana",
    "startdate":"2013-4-8 0:00:00",
    "enddate":"2013-4-8 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41379,
    "title":"Mod 1&2 - Ghana",
    "description":"Mod 1&2 - Ghana",
    "startdate":"2013-4-15 0:00:00",
    "enddate":"2013-4-15 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41407,
    "title":"Mod 1&2 - Ghana",
    "description":"Mod 1&2 - Ghana",
    "startdate":"2013-5-13 0:00:00",
    "enddate":"2013-5-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41435,
    "title":"Mod 1&2 - Ghana",
    "description":"Mod 1&2 - Ghana",
    "startdate":"2013-6-10 0:00:00",
    "enddate":"2013-6-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41321,
    "title":"3 National Agriculture Research System (NARS) Internship",
    "description":"3 National Agriculture Research System (NARS) Internship",
    "startdate":"2013-2-16 0:00:00",
    "enddate":"2013-2-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41349,
    "title":"2 NARS Internship",
    "description":"2 NARS Internship",
    "startdate":"2013-3-16 0:00:00",
    "enddate":"2013-3-16 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41377,
    "title":"3 NARS Internship ",
    "description":"3 NARS Internship ",
    "startdate":"2013-4-13 0:00:00",
    "enddate":"2013-4-13 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41405,
    "title":"3 NARS Internship ",
    "description":"3 NARS Internship ",
    "startdate":"2013-5-11 0:00:00",
    "enddate":"2013-5-11 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41428,
    "title":"3 NARS Internship ",
    "description":"3 NARS Internship ",
    "startdate":"2013-6-3 0:00:00",
    "enddate":"2013-6-3 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41461,
    "title":"3 NARS Internship ",
    "description":"3 NARS Internship ",
    "startdate":"2013-7-6 0:00:00",
    "enddate":"2013-7-6 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41477,
    "title":"Champion Retreat Tanzania",
    "description":"Champion Retreat Tanzania",
    "startdate":"2013-7-22 0:00:00",
    "enddate":"2013-7-22 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":50,
    "icon":""
  },
  {
    "id":41470,
    "title":"Parliamentary Agricultural Tour",
    "description":"Parliamentary Agricultural Tour",
    "startdate":"2013-7-15 0:00:00",
    "enddate":"2013-7-15 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41521,
    "title":"Champion Meeting Ghana",
    "description":"Champion Meeting Ghana",
    "startdate":"2013-9-4 0:00:00",
    "enddate":"2013-9-4 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41527,
    "title":"Champion Meeting Ghana",
    "description":"Champion Meeting Ghana",
    "startdate":"2013-9-10 0:00:00",
    "enddate":"2013-9-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41442,
    "title":"Sponsored 8 Nigerian MoA M&E training ",
    "description":"Sponsored 8 Nigerian MoA M&E training ",
    "startdate":"2013-6-17 0:00:00",
    "enddate":"2013-6-17 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41365,
    "title":"Ethiopia Policy Assessment",
    "description":"Ethiopia Policy Assessment",
    "startdate":"2013-4-1 0:00:00",
    "enddate":"2013-4-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41485,
    "title":"Rwanda Policy Assessment",
    "description":"Rwanda Policy Assessment",
    "startdate":"2013-7-30 0:00:00",
    "enddate":"2013-7-30 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41404,
    "title":"Ghana Policy Assessment ",
    "description":"Ghana Policy Assessment ",
    "startdate":"2013-5-10 0:00:00",
    "enddate":"2013-5-10 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":41567,
    "title":"Zambia Policy Assessment",
    "description":"Zambia Policy Assessment",
    "startdate":"2013-10-20 0:00:00",
    "enddate":"2013-10-20 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41562,
    "title":"EAC Policy Assessment ",
    "description":"EAC Policy Assessment ",
    "startdate":"2013-10-15 0:00:00",
    "enddate":"2013-10-15 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41456,
    "title":"Mozambique Policy Assessment ",
    "description":"Mozambique Policy Assessment ",
    "startdate":"2013-7-1 0:00:00",
    "enddate":"2013-7-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41390,
    "title":"Malawi Policy Assessment",
    "description":"Malawi Policy Assessment",
    "startdate":"2013-4-26 0:00:00",
    "enddate":"2013-4-26 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":40,
    "icon":""
  },
  {
    "id":41397,
    "title":"Tanzania Policy Assessment",
    "description":"Tanzania Policy Assessment",
    "startdate":"2013-5-3 0:00:00",
    "enddate":"2013-5-3 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  },
  {
    "id":420000,
    "title":"DRC Policy Assessment ",
    "description":"DRC Policy Assessment ",
    "startdate":"2013-11-1 0:00:00",
    "enddate":"2013-11-1 0:00:00",
    "date_display":"day",
    "link":"#",
    "importance":60,
    "icon":""
  }
]
  }
];

					M.parseTimelineData(data, callback);
									
			    } // end [obj vs #/table vs remote]
			    
			    
			    M.loadedSources.push(src);

		    } 
		
		
		} else {
		
		
		  // NO INITIAL DATA:
		  // That's cool. We still build the timeline
		  // focusdate has been set to today
		  // !AUTH: USED IN AUTHORING MODE
		  this.timelineDataLoaded = true;
		  this.setZoomLevel(Math.floor((this.max_zoom + this.min_zoom) / 2));
		  this.tryLoading();
		  
		  
		}
	
	},
	
	
	// click coming from marker on Google map
	mapMarkerClick: function(ev) {
		this.focusToEvent(ev);
	},
	
	getTimelineCollection: function() {
		return this.timelineCollection;
	},
	
	timelineTitleClick: function(timeline_id) {
		$.publish(container_name + ".mediator.timelineTitleClick", {timeline_id:timeline_id});
	},
	  
	  
	/*
	*  getTableTimelineData
	*  @param table_id {string} the html/DOM id of the table
	*  @return timeline data object ready for parsing
	*
	*/
	getTableTimelineData : function (table_id) {
	
	  var tl = {},
	      now = 0,
	      keys = [], field, value,
		      event_id = '',
		      $table = $(table_id);
	
		  // timeline head
		  tl.id = table_id.substr(1);		 
		  tl.title = $table.attr("title") || "untitled";
		  tl.description = $table.attr("description") || "";
		  tl.focus_date = $table.attr("focus_date") || TG_Date.getToday();
		  tl.initial_zoom = $table.attr("initial_zoom") || 20;
		  tl.events = [];
	
	  $table.find('tr').each(function(i){
	
	      	var children = $(this).children(),
	          row_obj;
	
	      	// first row -- <th> or <td>, gather the field names
	       	if ( i === 0 ) {
	
	        	keys = children.map(function(){
	            	// using "tg-*" map each column to the corresponding data
	          		return $(this).attr( 'class' ).replace( /^.*?\btg-(\S+)\b.*?$/, '$1' );
	        	}).get();
	
	      	} else {
				// i.e. an event
	       		row_obj = {};
	
				children.each(function(i){
					field = keys[i];
					
					if (field == "description"){
						value = $(this).html();
					} else {
						value = $(this).text();
					}
					
					// TODO: VALIDATE EVENT STUFF HERE
	
					row_obj[ field ] = value;
				});
				event_id = 'ev_' + now++;
				row_obj.id = event_id;
	        	tl.events.push(row_obj);
	
	      	} // end if-else i===0
	}); // end .each()
	
	    $table.css("display", "none");
	    return tl;
	},
	
	
	runLoadedTimelineCallback: function(callback, data) {
				
		var args = callback.args || "";
				
		callback.fn(args, data);
		
		
		
		if (callback.load_as_only_timeline) {
			//debug.log("callback DISPLAY true...");
			this.activeTimelines = [];
			this.toggleTimeline(id);
			
			
		} else if (callback.toggle || callback.load_into_context) {
			// add it without changing 
			this.activeTimelines = [data[0].id];
			this.refresh();
			// this.toggleTimeline(data[0].id);
		}

	},
	
 
	/*
	* parseTimelineData
	* @param data {object} Multiple (1+) timelines object 
	* derived from data in loadTimelineData
	*/
	parseTimelineData : function (json, callback) {		
		
		var data = "",
			me = this;
			

		if (typeof json.presentation == "string") {
			
			timeglider.mode = "presentation";
			
			data = json.timelines;
			
			// get presentation info
			me.initial_timelines = json.initial_timelines;
			
			// ALSO, LEGEND
			me.presentation = {
				title:json.title,
				description:json.description,
				open_modal:json.open_modal,
				focus_date:new tg.TG_Date(json.focus_date),
				initial_zoom:json.initial_zoom
			}
		
		} else {
			data = json;
		}
		
		var M = this,
			ct = 0,
			dl = data.length, 
			ti = {}, 
			ondeck = {};
	
		for (var i=0; i<dl;i++) {
	  
			ondeck = data[i];
			ondeck.mediator = M;
					
			ti = new tg.TG_Timeline(ondeck).toJSON(); // the timeline
					
			if (ti.id.length > 0) {
				ct++;
				M.swallowTimeline(ti);
			}
			
	
		}
		
		// TYPICALLY A SECONDARY (user-called from page) LOAD
		// WHICH MIGHT HAVE CUSTOMIZD CALLBACK ACTIONS...
		
		if (callback && (typeof callback.fn == "function" || typeof callback == "function")) {
						
			// normalize callback to fn property
			if (typeof callback == "function") {
				callback = {fn:callback};
			}
			
			setTimeout(function() {				
				M.runLoadedTimelineCallback(callback, data, M);
			}, 100);
			
			if (callback.display || callback.toggle) {
				return false;
			}

		} 
				
		if (ct === 0) {
			alert("ERROR loading data: Check JSON with jsonLint");
		} else {


			if (typeof callback.display == "undefined") {
				callback.display = true;
			} 
			
			this.timelineDataLoaded = true;
			if (callback.display || callback.toggle) {
				this.tryLoading();
			}
		}
	
	},
	
	
	
  
	/*
	*  tryLoading
	*  Sees if all criteria for proceeding to display the loaded data
	*  are complete: data, image sizeing and others
	*
	*/
	tryLoading : function () {
		
		var a = (this.imagesSized == this.imagesToSize),
	    	b = (this.timelineDataLoaded == true);
	
		
		if (a && b) {
	    		    	
	    	this.setInitialTimelines();
						
	    	if (this.timelineCollection.length == 1) {	
	    			
				// IF SINGLE TIMELINE
				tl = MED.timelineCollection.at(0);
				this.singleTimelineID = tl.get("id");
				
				this.setImageLaneHeight(tl.get("image_lane_height") || 0, false, true);
			}
			
			
			$.publish(container_name + ".mediator.timelineDataLoaded");
			
			
    	}
	    	
		
	},
	
	


    /* Makes an indexed array of timelines */
    swallowTimeline : function (obj) {
						
		this.sole_timeline_id = obj.id;
		
		var exists = this.timelineCollection.get(obj.id);
		
		// if the object exists already...
		if (exists) {
			exists.set(obj);
			
		} else {
			// UPDATE!!
			this.timelineCollection.add(obj);
		}	
		
    },
    



    /* 
    now loads multiple initial timelines: make sure
    to set the "top" attributes of timelines to make sure
    they don't overlap when initially loaded
    */
    setInitialTimelines : function () {
        
		var me = this;
		
		// PART I
		// What are the initially loaded timelines (ids) ?
			
		if (me.initial_timelines.length > 0) {
			
			me.activeTimelines = me.initial_timelines;			
		
		} else {			
			// initial timelines set by widget settings
			var initial_timelines = me.initial_timeline_id,
			first_focus_id = "";
			
			// i.e. it's an array
	      	if (typeof initial_timelines == "object") {
	      		// set first timeline in array as one to focus on
	      		first_focus_id = this.initial_timeline_id[0];
	      		// make all specified ids active
	      		_.each(initial_timelines, function (id) {
	      			me.activeTimelines.push(id);
	      		});
	      		
	      	} else if (initial_timelines.length > 0){
	      		// not an array: a string would be single id or ""
	      		first_focus_id = this.initial_timeline_id || this.sole_timeline_id;
	      		me.activeTimelines = [first_focus_id];
	      	} else if (this.timelineCollection.length > 0) {
	      		// in case there is no initial id
	      		first_focus_id = this.timelineCollection.pluck("id")[0];
	      		me.activeTimelines = [first_focus_id];
	      	}
	    }
	    
	    // PART II
	    // Set the timeline up according to initial_timeline
	    // or single timeline or presentation
	      
	    
      	if (timeglider.mode == "presentation") {
      		
      		// do nothing??
      		
      	} else if (timeglider.mode == "authoring") {
      		// no timelines loaded right away
      		me.setZoomLevel(40);
      		
      	} else if (first_focus_id) {
      	
      		// we need to wait just a bit...
			setTimeout(function () { 
				
				// timeline on which to focus is first/only
				var tl = me.timelineCollection.get(first_focus_id);
				var tl_fd = tl.get("focusDateObj");
			
				me.setFocusDate(tl_fd);
			
				// resetting zoomLevel will refresh
				me.setZoomLevel(tl.get("initial_zoom"));
				
			}, 500);
			
		} else {
			// could be no timelines to load
			me.setZoomLevel(40);
		}
      
    }, 


	refresh : function () {
		$.publish(container_name + ".mediator.refreshSignal");       
    },


    
    setTicksReady : function (bool) {
        this.ticksReady = bool;
        
        this.startSec = this._focusDate.sec;
                
        if (bool === true) { 
          $.publish(container_name + ".mediator.ticksReadySignal");
          
          
        }
        
       
   
    },

    
    
     /*
    *  setTimeoffset
    *  @param offset [String] eg: "-07:00"
    *      
    */
    setTimeoffset : function (offsetStr) {
    	
        this.timeOffset = TG_Date.getTimeOffset(offsetStr);
        this.refresh();
    },
    
    
    // timezone hours/minutes ofset
    getTimeoffset : function () {
        return this.timeOffset;
    },
    
    
    /*
    *  setTimeoffset
    *  @param offset [String] eg: "-07:00"
    *      
    */
    setDimensions : function (d) {
        this.dimensions = d;
        // debug.log("dimensions:", d);
    },
      
    /*
    *  setFocusDate
    *  @param fd [TG_Date instance]
    *      
    */
    setFocusDate : function (fd) {
    
     	
		if (fd != this._focusDate) {
			this._focusDate = fd; 
        }
    },
    
    getFocusDate : function () {
        return this._focusDate;
    },
      
      
    
    /*
    * getZoomLevel
    * @return {Number} zoom level number from 1 to 100
    *
    *
    *
    */
    getZoomLevel : function () {
        return parseInt(this._zoomLevel);
    },
    
    
        
    mousewheelChange: function(dir) {
    
    	var opt = this.options.mousewheel;

    	if (opt === "zoom") {
	    	if (this.viewMode == "timeline") {
	    		var zl = this.getZoomLevel();
				this.setZoomLevel(zl += dir);
			}
			
		} else if (opt === "pan") {
			$.publish(container_name + ".mediator.mousewheelChange", {"dir":dir, "action":"pan"});
		}
		
		
		
    },


	/* 
	*  setZoomLevel
	*  This in turn sets other zoomInfo attributes : width, label, tickWidth
	*  Other zoom info comes from the zoomTree array
	*  @param z ==> integer from 1-100
	*  
	*/
	setZoomLevel : function (z) {
	   	
	   if (z < 1) { z = 1; }
	   	
	   	
		if (z==1 || (z <= this.max_zoom && z >= this.min_zoom)) {
		
			// focusdate has to come first for combined zoom+focusdate switch
			this.startSec = this._focusDate.sec;

			if (z != this._zoomLevel) {
			
			    this._zoomLevel = z;
			    this._zoomInfo = tg.zoomTree[z];
			    
			    $.publish(container_name + ".mediator.zoomLevelChange");
			    $.publish(container_name + ".mediator.scopeChange");
	
			    return true;
			    
			} else {
		    	return false;
			}
		  // end min/max check
		} else { return false; }
	
	}, 


	/*
	*  getZoomInfo
	*  @return obj {Object} with 
	*          zoomLevel (Number), label (String), tickWidth (Number), unit (String)
	*
	*/
	getZoomInfo : function () {
		return this._zoomInfo;
	},
	
	
	
	/* 
	 * from click etc. on page, what is the date?
	 */
	getDateFromOffset: function (dp_x) {
			
		var me = this,
			ctnr = me.dimensions.container,
			Cw = ctnr.width,
    		Cx = dp_x - (ctnr.offset.left),
    		offMid = Cx - Cw/2,
	    	secPerPx = me.getZoomInfo().spp,
	    	fdSec = me.getFocusDate().sec,
			dcSec = Math.floor(fdSec + (-1 * this.timeOffset.seconds) + (offMid * secPerPx));
			
			return new TG_Date(dcSec);
	},
	
	
	
	// incoming: {name:"dblclick", event:e, dimensions:me.dimensions}
	registerUIEvent: function (info) {
		var me = this;
		
		switch(info.name) {
			case "dblclick": case "dbltap":
			// info comes with 
				
				var clickDate = me.getDateFromOffset(info.event.pageX);
				var ui_event = info.event;
			
				$.publish(container_name + ".mediator.dblclick", {date:clickDate, event:ui_event});
				
			break;
		}
	},
        
        
        
	/*
	*  setFilters
	*  @param obj {Object} containing: 
	*         	required: origin ("clude", "legend", "tags"), 
				possible: include (string), 
				possible: exclude (string), 
				possible: legend (object)
				possible: title_andor_desc (string)
				possible: tags (array)
	*  @param extra {Mixed} would be the specific array to add to the legend filter array
	*         for example for all legend icons
	*/
    setFilters : function (obj, extra) {
    
    	var me = this;
      
		switch (obj.origin) {
		
			case "clude":
				this.filters.include = obj.include;
				this.filters.exclude = obj.exclude;
			break;
			
			case "title_andor_desc":
				this.filters.description = obj.description;
				this.filters.title = obj.title;
				
				if (obj.tags) {
					this.filters.tags = obj.tags.split(",");
				} else {
					this.filters.tags = [];
				}
				
			break;
						
			
			case "tags":
				if (obj.tags) {
					this.filters.tags = obj.tags.split(",");
				} else {
					this.filters.tags = [];
				}
			break;
			
			
			case "legend":
				
				// subtract the icons folder URL...
				// starting icon with "shapes/" etc.
				var icon = obj.icon.replace(me.options.icon_folder, "");
	
				if (icon == "all") {
					// put all icons into legend???
					this.filters.legend = []; // nothing to filter against, all will show
					$.publish(container_name + ".mediator.legendAll");
					
				} else if (icon == "none") {
					
					this.filters.legend = ["_none_.png"]; // no events will match this
					$.publish(container_name + ".mediator.legendAll");
				
				} else  if (icon == "provided") {
					this.filters.legend = extra;
					
				} else {
					// if it's not in filter, add it			
					if (_.indexOf(this.filters.legend, icon) == -1) {
						this.filters.legend.push(icon);
					} else {
					// otherwise remove it
						var fol = this.filters.legend;
						var fr = [];
						fr = $.grep(fol, function (a) { return a != icon; });
						this.filters.legend = fr;
					}
				
				 } // end if/else for "clear"
				  
			break;
			
			
			case "custom": 
				if (obj.action == "add") {
					this.filters.custom = obj.fn;
					// debug.log("this.filters.custom:", this.filters.custom);
				} else {
					delete this.filters.custom;
				}
			break;
		
		} // end switch
   		
   		
        $.publish(container_name + ".mediator.filtersChange"); 
        
           
        this.refresh();
	},
      




    clearFilters: function(clear) {
    	
    	clear_legend = clear.legend || false;
    	clear_custom = clear.custom || false;
    	
    	this.filters.exclude = "";
    	this.filters.include = "";
    	this.filters.title = "";
    	this.filters.description = "";
    	
    	if (clear_legend) {
    		this.filters.legend = [];
    	}
    	
    	if (clear_custom) {
    		this.filters.custom = "";
    	}

    },
      

	getTicksOffset : function () {
		return this._ticksOffset;
	},


	setTicksOffset : function (newOffset) {
		// This triggers changing the focus date
		// main listener hub for date focus and tick-appending
		this._ticksOffset = newOffset;
		
		// In other words, ticks are being dragged!
		$.publish(container_name + ".mediator.ticksOffsetChange");
		$.publish(container_name + ".mediator.scopeChange");
	},



	/*
	*  getTickBySerial
	*  @param serial {Number} serial date unit number (rata die, monthnum, year, etc)
	*
	*  @return {Object} info about _existing_ displayed tick
	*
	*/
	getTickBySerial : function (serial) {
		var ta = this.ticksArray,
		tal = ta.length;
		for (var t=0; t<tal; t++) {
			var tick = ta[t];
			if (tick.serial == serial) { return tick; }
		}
		return false;
	},



	/*
	*  addToTicksArray
	*	 @param obj {Object} 
	*		  serial: #initial tick
	*		  type:init|l|r
	*		  unit:ye | mo | da | etc
	*		  width: #px
	*		  left: #px
	*	 @param focusDate {TG_Date}
	*		 used for initial tick; others set off init
	*/
	addToTicksArray : function (obj, focusDate) {
		
		// var ser = 0;
		
		if (obj.type == "init") {
			// CENTER
			obj.serial = TG_Date.getTimeUnitSerial(focusDate, obj.unit);
			this.ticksArray = [obj];
		} else if (obj.type == "l") {
			// LEFT
			obj.serial = this.ticksArray[0].serial - 1;
			this.ticksArray.unshift(obj);
		} else {
			// RIGHT SIDE
			obj.serial = this.ticksArray[this.ticksArray.length -1].serial + 1;
			this.ticksArray.push(obj);
		}
		
		// this.ticksArrayChange.broadcast();
		$.publish(container_name + ".mediator.ticksArrayChange");
		
		return obj.serial;
	},

	toggleTimeline : function (id, keep_focus) {
		
		// patch until we have better multi-timeline support
		// this is a true "toggle" in that it clears visible
		// timelines and loads the new timeline by id
		
		var keep = keep_focus || false;

		var tl = this.timelineCollection.get(id).attributes;
		
		var refresh = false;
				
		var active = _.indexOf(this.activeTimelines, id);
			
		if (active == -1) {
			// timeline not active ---- bring it on
			this.activeTimelines.push(id);
			
			// set to timeline's 
			if (!keep) {
								
				// timeline focus_date is ISO-8601 basic;
				// interface focusdate needs a TG_Date()
				var tl_fd = new TG_Date(tl.focus_date);
				
				// setting FD does NOT refresh
				this.setFocusDate(tl_fd);
				
				// resetting zoomLevel will refresh
				this.setZoomLevel(tl.initial_zoom);
				
				if (tl.initial_zoom == this.getZoomLevel()) {
					refresh = true;
				}
			
			} else {
				// just added timeline to list, refreshing
				refresh = true;
			}
			
		
		} else {
			// it's active, remove it
			this.activeTimelines.splice(active,1);
			refresh = true;
		}		
		
		
		
		if (refresh) {
			this.refresh();
		}
		
		$.publish(container_name + ".mediator.activeTimelinesChange");
	
	},
	
	
           
	/*
	*  reportImageSize
	*  @param img {Object} has "id" of event, "src", "width" and "height" at least
	*  
	*  This information is reported from TG_Timeline as data is loading. Since image
	*  size gathering sidetracks from data loading, there's a 
	*/
	reportImageSize : function (img) {
	 
		var ev = MED.eventCollection.get(img.id);
		
		if (ev.has("image")) {
			if (!img.error) {
				ev.attributes.image.width = img.width;
				ev.attributes.image.height = img.height;
			} else {
				ev.attributes.image = {};
				debug.log("WHOOPS: MISSING IMAGE: " + img.src);
			}
		
			this.imagesSized++;
		
			if (this.imagesSized == this.imagesToSize) {
				// if there are images, this would usually be
				// the last step before proceeding
				this.tryLoading();
			}
		}
	}



///// end model prototype object
}; 
        
        
tg.getLowHigh = function (arr) {
	
	var sorted = _.sortBy(arr, function(g){ return parseInt(g); });
	
	return {"low":_.first(sorted), "high":_.last(sorted)}

};
        
  
    	  
        
        
tg.validateOptions = function (widget_settings) {	
  
	this.optionsMaster = { 
		initial_focus:{type:"date"}, 
		timezone:{type:"timezone"},
    	editor:{type:"string"}, 
    	backgroundColor:{type:"color"}, 
    	backgroundImage:{type:"color"}, 
    	min_zoom:{type:"number", min:1, max:100}, 
    	max_zoom:{type:"number", min:1, max:100}, 
    	initial_zoom:{type:"number", min:1, max:100}, 
    	show_centerline:{type:"boolean"}, 
    	display_single_timeline_info: {type:"boolean"},
    	minimum_timeline_bottom: {type:"number", min:0, max:1000},
    	display_zoom_level:{type:"boolean"}, 
    	data_source:{type:"url"}, 
    	basic_fontsize:{type:"number", min:9, max:100}, 
    	mousewheel:{type:"string", possible:["zoom","pan","none"]}, 
    	initial_timeline_id:{type:"mixed"},
    	icon_folder:{type:"string"},
    	show_footer:{type:"boolean"},
    	display_zoom_level:{type:"boolean"},
    	constrain_to_data:{type:"boolean"},
    	boost:{type:"number", min:0, max:99},
    	event_modal:{type:"object"},
    	event_overflow:{type:"string"}
  	}
  	
	// msg: will be return value: validates when empty 
	// change lb to <br> if the error is returned in HTML (vs alert())
	var me = this, msg = "", lb = "\n";

	$.each(widget_settings, function(key, value) { 

		if (me.optionsMaster[key]) {

			switch (me.optionsMaster[key].type) {
				case "string": 
					if (typeof value != "string") { msg += (key + " needs to be a string." + lb); }
					if (me.optionsMaster[key].possible) {
						if (_.indexOf(me.optionsMaster[key].possible, value) == -1) {
							msg += (key + " must be: " + me.optionsMaster[key].possible.join(" or "));
						}
					}
				break;

				case "number":
					if (typeof value != "number") { msg += (value + " needs to be a number." + lb); }
					if (me.optionsMaster[key].min) {
						if (value < me.optionsMaster[key].min) {
							msg += (key + " must be greater than or equal to " + me.optionsMaster[key].min + lb);
						}
					}

					if (me.optionsMaster[key].max) {
						if (value > me.optionsMaster[key].max) {
							msg += (key + " must be less than or equal to " + me.optionsMaster[key].max + lb);
						}
					}
				break;

				case "date":
					// TODO validate a date string using TG_Date...
				break;
				
				case "timezone":
					
					var cities = ["New York", "Denver", "Chicago", "Los Angeles"];
					var pattern = /[+|-]?[0-9]+:[0-9]+/;
						if ((_.indexOf(cities, value) == -1) && (value.match(pattern) == -1)) { 
							msg += ("The timezone is not formatted properly");
						}
						
				break;

				case "boolean":
					if (typeof value != "boolean") msg += (value + " needs to be a number." + lb);
				break;

				case "url":
					// TODO test for pattern for url....
				break;

				case "color":
					/// TODO test for pattern for color, including "red", "orange", etc
				break;

				case "mixed":
					/// TODO test for pattern for color, including "red", "orange", etc
				break;
			}
		}
	}); // end each

	return msg;

};

        
       
})(timeglider);