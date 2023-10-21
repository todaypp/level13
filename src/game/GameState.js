// persistent data related to the current playthrough

define(['ash', 'worldcreator/WorldCreatorHelper'], function (Ash, WorldCreatorHelper) {
	var GameState = Ash.Class.extend({

		constructor: function () {
			this.reset();
		},

		reset: function () {
			this.level = 0;
			this.worldSeed = 0;
			this.gameStartTimeStamp = 0;
			this.gameTime = 0; // total tick time passed
			this.playTime = 0; // total active play time - gameTime minus fast-forwarded time
			this.isPaused = false;
			this.hasCheated = false;
			this.numExceptions = 0;
			this.numCamps = 0;
			this.numVisitedSectors = 0;
			this.numUnlockedMilestones = 0;
			this.isLaunchStarted = false;
			this.isLaunched = false;
			this.isLaunchCompleted = false;
			this.isFinished = false;
			this.playedVersions = [];

			this.unlockedFeatures = {};

			this.uiStatus = {
				mouseDown: false,
				currentTab: null,
				mapVisited: false,
				isHidden: false,
				isBlocked: false,
				isTransitioning: false,
				isInitialized: false,
				isInCamp: false,
				hiddenProjects: [],
				leaveCampRes: {},
				leaveCampItems: {},
				lastSelection: {},
			};
			
			this.settings = {
				
			};
			
			this.stats = {};
			this.initStats();

			this.completedTutorials = {}; // id -> timestamp
			this.completedTutorialGroups = {}; // id -> timestamp

			this.uiBagStatus = {
				itemsOwnedSeen: [],
				itemsUsableSeen: [],
				itemsCraftableUnlockedSeen: [],
				itemsCraftableAvailableSeen: []
			},

			this.foundTradingPartners = []; // camp ordinals
			this.foundLuxuryResources = [];

			this.actionCooldownEndTimestamps = {};
			this.actionDurationEndTimestamps = {};
			
			this.pendingUpdateTime = 0;
			this.extraUpdateTime = 0;
		},

		initStats: function () {
			// simple: simple value (int)
			this.initGameStatSimple("numBlueprintPiecesFound");
			this.initGameStatSimple("numExcursionsStarted");
			this.initGameStatSimple("numExcursionsSurvived");
			this.initGameStatSimple("numFightsFled");
			this.initGameStatSimple("numFightsStarted");
			this.initGameStatSimple("numFightsWon");
			this.initGameStatSimple("numFollowersRecruited");
			this.initGameStatSimple("numItemsCrafted");
			this.initGameStatSimple("numStepsTaken");
			this.initGameStatSimple("numTimesScavenged");
			this.initGameStatSimple("numTimesScouted");
			this.initGameStatSimple("numTradesMade");

			// keyed: value (int) by key (string / int)
			this.initGameStatKeyed("numBuildingsBuiltPerId");
			this.initGameStatKeyed("numItemsUsedPerId");
			this.initGameStatKeyed("numStepsPerLevel");
			this.initGameStatKeyed("numTimesDespairedPerLevel");
			this.initGameStatKeyed("timeOutsidePerLevel");
			this.initGameStatKeyed("numTimesKilledByEnemy");
			this.initGameStatKeyed("numTimesKilledEnemy");

			// high score: value (int) with corresponding entry (vo)
			this.initHighScoreStat("mostDistantSectorFromCampVisited");
			this.initHighScoreStat("mostDistantSectorFromCenterVisited");

			// list: list of unique ids (string) where value is length
			this.initListStat("uniqueItemsCrafted");
		},

		syncData: function () {
			// remove duplicates / old values
			let partners = this.foundTradingPartners;
			this.foundTradingPartners = [];
			for (let campOrdinal = 1; campOrdinal < 15; campOrdinal++) {
				if (partners.indexOf(campOrdinal) >= 0) {
					this.foundTradingPartners.push(campOrdinal);
				}
			}
			
			// reset ui state
			if (!this.uiStatus.lastSelection) this.uiStatus.lastSelection = {};

			// init stats in case new ones added
			this.initStats();
			
			// complete ending if launch started
			if (this.isLaunchStarted || this.isLaunched || this.isLaunchCompleted || this.isFinished) {
				this.isLaunchStarted = true;
				this.isLaunched = true;
				this.isLaunchCompleted = true;
				this.isFinished = true;
			}
		},
		
		isFeatureUnlocked: function (featureID) {
			return this.unlockedFeatures[featureID] || false;
		},
		
		getUnlockedResources: function () {
			let result = {};
			for (let key in resourceNames) {
				let name = resourceNames[key];
				result[name] = this.unlockedFeatures["resource_" + name] || false;
			}
			return result;
		},

		passTime: function (seconds) {
			this.extraUpdateTime = seconds;
			var cooldownkeys = Object.keys(this.actionCooldownEndTimestamps);
			for (let i = 0; i < cooldownkeys.length; i++) {
				this.actionCooldownEndTimestamps[cooldownkeys[i]] = this.actionCooldownEndTimestamps[cooldownkeys[i]] - seconds * 1000;
			}
		},
		
		savePlayedVersion: function (version) {
			if (this.playedVersions.indexOf(version) < 0) {
				this.playedVersions.push(version);
			}
			log.i("played versions: " + this.playedVersions.join(","));
		},

		isSimpleStat: function (name) {
			return (typeof (this.stats[name]) === 'number');
		},

		initGameStatSimple: function (name) {
			if (this.isSimpleStat(name)) return;
			this.stats[name] = 0;
		},

		increaseGameStatSimple: function (name, value) {
			if (!this.stats[name] && this.stats[name] !== 0) {
				debugger
				log.w("[GameStats] can't increase simple player stat [" + name + "]: no such player stat");
				return;
			}
			
			if (!this.isSimpleStat(name)) {
				debugger
				log.w("[GameStats] can't increase simple player stat [" + name + "]: not a simple stat");
				return;
			}

			if (!value && value !== 0) value = 1;

			this.stats[name] += value;

			if (this.logStatChanges(name)) log.i("[GameStats] increased simple stat [" + name + "]: now " + this.stats[name]);
		},

		getGameStatSimple: function (name) {
			return this.stats[name] || this[name] || 0;
		},

		isKeyedStat: function (name) {
			return (typeof (this.stats[name]) === 'object') && !("entry" in this.stats[name]);
		},

		initGameStatKeyed: function (name) {
			if (this.isKeyedStat(name)) return;
			this.stats[name] = {};
		},

		increaseGameStatKeyed: function (name, key, value) {
			if (!this.stats[name]) {
				debugger
				log.w("[GameStats] can't increase keyed player stat [" + name + "]: no such player stat");
				return;
			}

			if (!this.isKeyedStat(name)) {
				debugger
				log.w("[GameStats] can't increase keyed player stat [" + name + "]: not a keyed stat");
				return;
			}

			if (!value && value !== 0) value = 1;
			if (typeof (key) === "object") key = key.id;

			if (!this.stats[name][key]) this.stats[name][key] = 0;
			this.stats[name][key] += value;

			if (this.logStatChanges(name)) log.i("[GameStats] increased keyed stat [" + name + "][" + key + "]: now " + this.stats[name][key]);
		},

		getGameStatKeyedSum: function (name) {
			if (!this.isKeyedStat(name)) {
				log.w("[GameStats] no such keyed stat [" + name + "]");
				return 0;
			}

			let result = 0;
			for (let key in this.stats[name]) {
				result += this.stats[name][key];
			}

			return result;
		},

		isHighScoreStat: function (name) {
			return (typeof (this.stats[name]) === 'object') && ("entry" in this.stats[name]);
		},

		initHighScoreStat: function (name) {
			if (this.isHighScoreStat(name)) return;
			this.stats[name] = { value: 0, entry: null };
		},

		increaseGameStatHighScore: function (name, entry, value) {
			if (!this.stats[name]) {
				debugger
				log.w("[GameStats] can't increase high score player stat [" + name + "]: no such player stat");
				return;
			}

			if (!this.isHighScoreStat(name)) {
				debugger
				log.w("[GameStats] can't increase high score player stat [" + name + "]: not a high score stat");
				return;
			}
			
			if (this.stats[name].entry != null && this.stats[name].value >= value) return;

			this.stats[name] = { value: value, entry: entry };
			
			if (this.logStatChanges(name)) log.i("[GameStats] increased high score stat [" + name + "]: now " + this.stats[name].value);
		},

		getGameStatHighScore: function (name) {
			if (this.isKeyedStat(name)) {
				return this.getGameStatHighScoreFromKeyed(name);
			}

			if (!this.isHighScoreStat(name)) {
				log.w("[GameStats] no such high score stat [" + name + "]");
				return null;
			}
			return this.stats[name] || {};
		},

		getGameStatHighScoreFromKeyed: function (name) {
			if (!this.isKeyedStat(name)) {
				log.w("[GameStats] no such keyed stat [" + name + "]");
				return null;
			}

			let maxValue = 0;
			let maxValueKey = null;

			for (let key in this.stats[name]) {
				let value = this.stats[name][key];
				if (value > maxValue) {
					maxValue = value;
					maxValueKey = key;
				}
			}

			return { value: maxValue, entry: maxValueKey };
		},

		isListStat: function (name) {
			return Array.isArray(this.stats[name]);
		},

		initListStat: function (name) {
			if (this.isListStat(name)) return;
			this.stats[name] = [];
		},

		increaseGameStatList: function (name, id) {
			if (!this.stats[name]) {
				debugger
				log.w("[GameStats] can't increase list player stat [" + name + "]: no such player stat");
				return;
			}

			if (!this.isListStat(name)) {
				debugger
				log.w("[GameStats] can't increase list player stat [" + name + "]: not a list stat");
				return;
			}

			if (this.stats[name].indexOf(id) >= 0) return;

			this.stats[name].push(id);
			
			if (this.logStatChanges(name)) log.i("[GameStats] increased list stat [" + name + "] with [" + id + "]: now " + this.stats[name].length);
		},

		getGameStatList: function (name) {
			return this.stats[name].length;
		},

		getLevelOrdinal: function (level) {
			return WorldCreatorHelper.getLevelOrdinal(this.worldSeed, level);
		},

		getLevelForOrdinal: function (levelOrdinal) {
			return WorldCreatorHelper.getLevelForOrdinal(this.worldSeed, levelOrdinal);
		},

		getCampOrdinal: function (level) {
			return WorldCreatorHelper.getCampOrdinal(this.worldSeed, level);
		},
		
		getCampOrdinalForLevelOrdinal: function (levelOrdinal) {
			let level = this.getLevelForOrdinal(levelOrdinal);
			return this.getCampOrdinal(level);
		},
		
		getLevelsForCamp: function (campOrdinal) {
			return WorldCreatorHelper.getLevelsForCamp(this.worldSeed, campOrdinal);
		},
		
		getLevelForCamp: function (campOrdinal) {
			let levelOrdinal = this.getLevelOrdinalForCampOrdinal(campOrdinal);
			return this.getLevelForOrdinal(levelOrdinal);
		},

		getLevelOrdinalForCampOrdinal: function (campOrdinal) {
			return WorldCreatorHelper.getLevelOrdinalForCampOrdinal(this.worldSeed, campOrdinal);
		},
		
		getLevelIndex: function (level) {
			var campOrdinal = this.getCampOrdinal(level);
			return WorldCreatorHelper.getLevelIndexForCamp(this.worldSeed, campOrdinal, level);
		},
		
		getMaxLevelIndex: function (level) {
			var campOrdinal = this.getCampOrdinal(level);
			return WorldCreatorHelper.getMaxLevelIndexForCamp(this.worldSeed, campOrdinal, level);
		},

		getTotalLevels: function () {
			return WorldCreatorHelper.getHighestLevel(this.worldSeed) - WorldCreatorHelper.getBottomLevel(this.worldSeed) + 1;
		},

		getGroundLevel: function () {
			return WorldCreatorHelper.getBottomLevel(this.worldSeed);
		},

		getGroundLevelOrdinal: function () {
			return WorldCreatorHelper.getLevelOrdinal(this.worldSeed, WorldCreatorHelper.getBottomLevel(this.worldSeed));
		},

		getSurfaceLevel: function () {
			return WorldCreatorHelper.getHighestLevel(this.worldSeed);
		},

		getSurfaceLevelOrdinal: function () {
			return WorldCreatorHelper.getLevelOrdinal(this.worldSeed, WorldCreatorHelper.getHighestLevel(this.worldSeed));
		},

		setActionCooldown: function (action, key, cooldown) {
			this.pruneActionCooldowns();
			let actionKey = action;
			if (key.length > 0) actionKey += "-" + key;
			log.i("setActionCooldown: [" + action + "] [" + key + "] [" + actionKey + "] [" + cooldown + "]");
			this.actionCooldownEndTimestamps[actionKey] = new Date().getTime() + cooldown * 1000;
		},

		getActionCooldown: function (action, key, max) {
			var actionKey = action;
			if (key.length > 0) actionKey += "-" + key;
			var timestamp = this.actionCooldownEndTimestamps[actionKey];
			if (timestamp) {
				var now = new Date().getTime();
				var diff = (timestamp - now) / 1000;
				if (diff > 0) {
					if (max && diff > max) {
						log.w("fix action cooldown: " + diff + " -> " + max);
						this.actionCooldownEndTimestamps[actionKey] = now + max;
					}
					return (timestamp - now) / 1000;
				}
			}
			return 0;
		},

		pruneActionCooldowns: function () {
			var cooldownkeys = Object.keys(this.actionCooldownEndTimestamps);
			if (cooldownkeys.length < 10) return;
			var now = new Date().getTime();
			for (let i = 0; i < cooldownkeys.length; i++) {
				var key = cooldownkeys[i];
				var timestamp = this.actionCooldownEndTimestamps[key];
				var diff = timestamp - now;
				if (diff < -30) delete this.actionCooldownEndTimestamps[key];
			}
		},

		setActionDuration: function (action, key, duration) {
			var actionKey = action;
			if (key.length > 0) actionKey += "-" + key;
			this.actionDurationEndTimestamps[actionKey] = new Date().getTime() + duration * 1000;
		},

		getActionDuration: function (action, key, max) {
			let actionKey = action;
			if (key.length > 0) actionKey += "-" + key;
			let timestamp = this.actionDurationEndTimestamps[actionKey];
			let maxMillis = max * 1000;
			if (timestamp) {
				let now = new Date().getTime();
				let diff = timestamp - now;
				if (diff > 0) {
					if (max && diff > maxMillis) {
						log.w("fix action duration: " + diff + " -> " + maxMillis);
						this.actionDurationEndTimestamps[actionKey] = now + maxMillis;
					}
					return (timestamp - now) / 1000;
				}
			}
			return 0;
		},

		getActionLocationKey: function (isLocationAction, playerPos) {
			var locationKey = "";
			if (isLocationAction) locationKey = playerPos.level + "-" + playerPos.sectorId();
			return locationKey;
		},

		logStatChanges: function (name) {
			return name && name.indexOf("timeOutside") < 0;
		},

	});

	return GameState;
});
