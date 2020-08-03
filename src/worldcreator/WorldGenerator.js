// Handles the first step of world generation, the abstract world template itself;
define([
	'ash',
	'worldcreator/WorldCreatorConstants',
	'worldcreator/WorldCreatorHelper',
    'worldcreator/WorldCreatorRandom',
    'worldcreator/WorldFeatureVO',
    'worldcreator/StageVO',
    'worldcreator/DistrictVO',
	'game/vos/PositionVO',
    'game/constants/SectorConstants',
    'game/constants/PositionConstants',
    'game/constants/WorldConstants',
], function (Ash, WorldCreatorConstants, WorldCreatorHelper, WorldCreatorRandom, WorldFeatureVO, StageVO, DistrictVO, PositionVO, SectorConstants, PositionConstants, WorldConstants) {
    
    var WorldGenerator = {
        
        prepareWorld: function (seed, worldVO) {
            worldVO.features = worldVO.features.concat(this.generateHoles(seed));
            worldVO.stages = this.generateStages(seed);
            worldVO.campPositions = this.generateCampPositions(seed, worldVO.features);
            worldVO.passagePositions = this.generatePassagePositions(seed, worldVO.features, worldVO.campPositions);
            worldVO.districts = this.generateDistricts(seed, worldVO.features);
        },
        
        generateHoles: function (seed) {
            var result = [];
			var topLevel = WorldCreatorHelper.getHighestLevel(seed);
			var bottomLevel = WorldCreatorHelper.getBottomLevel(seed);
            var explosionSize = 9;
            
            // wells
            var num = 4;
            for (var i = 0; i < num; i++) {
                var pos = WorldCreatorRandom.randomSectorPosition(seed % 100 + i * 10, 0, WorldCreatorConstants.AREA_SIZE_CENTRAL + i*2);
                var h = 2 + i + WorldCreatorRandom.randomInt(seed % 33 + 101 + i * 8, 0, 5);
                var minS = Math.max(i + 2, h / 4);
                var maxS = Math.min(10, h * 3);
                var x = WorldCreatorRandom.randomInt(seed % 50 + 66 + i * 31, minS, maxS);
                var y = WorldCreatorRandom.randomInt(seed % 33 + 101 + i * 82, minS, maxS);
                result.push(new WorldFeatureVO(pos.sectorX, pos.sectorX, x, y, topLevel - h, topLevel, WorldCreatorConstants.FEATURE_HOLE_WELL));
            }
            
            // collapses
            result.push(new WorldFeatureVO(0, 0, explosionSize, explosionSize, topLevel - 2, topLevel, WorldCreatorConstants.FEATURE_HOLE_COLLAPSE));
            
            // geogrpahy
            // - sea to the west (bay)
            var bayR = 12;
            result.push(new WorldFeatureVO(-WorldCreatorConstants.AREA_SIZE_MEDIUM, 0, bayR*2, bayR*2, bottomLevel, topLevel, WorldCreatorConstants.FEATURE_HOLE_SEA));
            // - mountains to the east
            var num = 3;
            for (var i = 0; i < num; i++) {
                var x = WorldCreatorConstants.AREA_SIZE_OUTSKIRTS - 10;
                var y = -20 + i * 11;
                var h = 3 + i + WorldCreatorRandom.randomInt(seed % 22 + 80 + i * 11, 0, 6);
                var s = h * 3;
                result.push(new WorldFeatureVO(x, y, s, s, bottomLevel, bottomLevel + h, WorldCreatorConstants.FEATURE_HOLE_MOUNTAIN));
            }
            
            return result;
        },
        
        generateStages: function (seed) {
            var stages = [];
            for (var campOrdinal = 1; campOrdinal <= WorldConstants.CAMPS_TOTAL; campOrdinal++) {
                var levels = WorldCreatorHelper.getLevelsForCamp(seed, campOrdinal);
                var numSectorsTotal = WorldCreatorHelper.getNumSectorsForCamp(seed, campOrdinal);
                var numSectorsEarly = WorldCreatorConstants.getNumSectors(campOrdinal, false) * 0.5;
                var numSectorsLate = numSectorsTotal - numSectorsEarly;
                
                stages.push(new StageVO(campOrdinal, WorldConstants.CAMP_STAGE_EARLY, [ levels[0] ], numSectorsEarly));
                stages.push(new StageVO(campOrdinal, WorldConstants.CAMP_STAGE_LATE, levels, numSectorsLate));
            }
            return stages;
        },
        
        generateCampPositions: function (seed, features) {
            var positionsByLevel = {};
			var topLevel = WorldCreatorHelper.getHighestLevel(seed);
			var bottomLevel = WorldCreatorHelper.getBottomLevel(seed);
            var maxCampDist = 4;
			for (var l = topLevel; l >= bottomLevel; l--) {
                var positions = [];
                var isCampableLevel = WorldCreatorHelper.isCampableLevel(seed, l);
                var campOrdinal = WorldCreatorHelper.getCampOrdinal(seed, l);
                if (isCampableLevel) {
                    var maxPathLen = WorldCreatorConstants.getMaxPathLength(campOrdinal - 1, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE);
                    var maxCenterDist = Math.min(15, Math.floor(maxPathLen * 0.8 - maxCampDist));
                    var center = new PositionVO(l, 0, 0);
                    var firstPos = new PositionVO(l, 0, 0);
                    var isValid = function (pos) { return WorldGenerator.isValidCampPos(seed, pos, positionsByLevel, features); };
                    if (l != 13) {
                        firstPos = WorldCreatorRandom.randomSectorPositionWithCheck(seed % 10 + (l+10) * 55, "camp pos", l, maxCenterDist, center, 0, isValid);
                    }
                    positions.push(firstPos);
                    if (l != 13) {
                        var secondPos = WorldCreatorRandom.randomSectorPositionWithCheck(seed % 100 + (l+5)*10, "camp pos", l, maxCampDist, firstPos, 1, isValid);
                        positions.push(secondPos);
                    }
                    // log.i("camp positions " + l + ": " + positions.join(" ") + " | maxCenterDist: " + maxCenterDist);
                }
                positionsByLevel[l] = positions;
            }
            return positionsByLevel;
        },
        
        generatePassagePositions: function (seed, features, campPositions) {
            var result = [];
			var topLevel = WorldCreatorHelper.getHighestLevel(seed);
			var bottomLevel = WorldCreatorHelper.getBottomLevel(seed);
			for (var l = topLevel; l >= bottomLevel; l--) {
                var campThisUp = this.getNextCampPosUp(seed, campPositions, l, true);
                var campPosDown =  this.getNextCampPosDown(seed, campPositions, l, false);
                var previousDown = l == topLevel ? null : result[l+1].down;
                var up = previousDown ? new PositionVO(l, previousDown.sectorX, previousDown.sectorY) : null;
                var down = l == bottomLevel ? null : this.getPassageDownPosition(seed, l, features, up, campThisUp, campPosDown);
                result[l] = { up: up, down: down };
            }
            return result;
        },
        
        generateDistricts: function (seed, features) {
            var result = [];
			var topLevel = WorldCreatorHelper.getHighestLevel(seed);
			var bottomLevel = WorldCreatorHelper.getBottomLevel(seed);
            
            // districts on specific levels
			for (var l = topLevel; l >= bottomLevel; l--) {
                result[l] = [];
                if (l == 14) {
                    this.generateDistrict(seed, result, SectorConstants.SECTOR_TYPE_INDUSTRIAL, l, 0, 0, 8, 8);
                }
            }
            
            // districts around features
            for (var i = 0; i < features.length; i++) {
                var feature = features[i];
                switch (feature.type) {
                    case WorldCreatorConstants.FEATURE_HOLE_SEA:
                        this.generateDistrictAround(seed, result, feature, SectorConstants.SECTOR_TYPE_RESIDENTIAL, 3, bottomLevel, 20);
                        break;
                    case WorldCreatorConstants.FEATURE_HOLE_WELL:
                        this.generateDistrictAround(seed, result, feature, SectorConstants.SECTOR_TYPE_RESIDENTIAL, 2, bottomLevel, topLevel);
                        break;
                    case WorldCreatorConstants.FEATURE_HOLE_MOUNTAIN:
                        this.generateDistrictAround(seed, result, feature, SectorConstants.SECTOR_TYPE_INDUSTRIAL, 2, bottomLevel, topLevel);
                        break;
                }
            }
            
            return result;
        },
        
        generateDistrictAround: function (seed, districts, feature, type, padding, minLevel, maxLevel) {
            for (var l = minLevel; l <= maxLevel; l++) {
                if (feature.spansLevel(l)) {
                    this.generateDistrict(seed, districts, type, l, feature.posX, feature.posY, feature.sizeX + padding * 2, feature.sizeY + padding * 2);
                }
            }
        },
        
        generateDistrict: function (seed, districts, type, level, x, y, sizeX, sizeY) {
            districts[level].push(new DistrictVO(level, x, y, sizeX, sizeY, type));
        },
        
        getPassageDownPosition: function (seed, level, features, passageUp, campPos1, campPos2) {
            var campOrdinal = WorldCreatorHelper.getCampOrdinal(seed, level);
            
            // find the camp positions furtherst away from one another (max camp-to-camp path length)
            if (campPos1.length == 0) campPos1.push(new PositionVO(level, 0, 0));
            if (campPos2.length == 0) campPos2.push(new PositionVO(level, 0, 0));
            var middle1 = PositionConstants.getMiddlePoint(campPos1);
            var middle2 = PositionConstants.getMiddlePoint(campPos2);
            campPos1.sort(function (a, b) { return PositionConstants.getDistanceTo(b, middle2) - PositionConstants.getDistanceTo(a, middle2); });
            campPos2.sort(function (a, b) { return PositionConstants.getDistanceTo(b, middle1) - PositionConstants.getDistanceTo(a, middle1); });
            var furthest1 = campPos1[0];
            var furthest2 = campPos2[0];
            
            // find average of the max positions = position that adds 0 to the max path length
            var allPos = [furthest1, furthest2];
            var averagePos = PositionConstants.getMiddlePoint(allPos);
            averagePos.level = level;
            
            // find out how much we can afford to add to the max path length by moving the passage from the "optimal" position
            var maxPathLength = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE);
            var startPathLength = Math.ceil(Math.max(PositionConstants.getDistanceTo(averagePos, furthest1), PositionConstants.getDistanceTo(averagePos, furthest2)));
            var maxDiff = Math.min(20, maxPathLength - startPathLength);
            var minDiff = Math.min(3, Math.floor(maxDiff / 2));
             //log.i("passage position " + level + " " + furthest1 + " - " + furthest2 + " -> middle: " + averagePos + " -> maxPathLength: " + maxPathLength + ", startPathLength: " + startPathLength + ", maxDiff: " + maxDiff + ", minDiff: " + minDiff);
            
            // select random sector around averagePos
            var rseed = seed % 1000 + 7 + (level+13)*101;
            var result = WorldCreatorRandom.randomSectorPositionWithCheck(
                rseed, "passage down pos " + level, level, maxDiff, averagePos, minDiff,
                (pos) => WorldGenerator.isValidPassageDownPos(seed, pos, features, passageUp, campPos1, campPos2)
            );
            return result;
            
        },
        
        getNextCampPosUp: function (seed, campPositions, from, inclusive) {
            var topLevel = WorldCreatorHelper.getHighestLevel(seed);
            var start = inclusive ? from : from + 1;
            for (var i = start; i <= topLevel; i++) {
                if (campPositions[i] && campPositions[i].length > 0) {
                    return campPositions[i];
                }
            }
            return null;
        },
        
        getNextCampPosDown: function (seed, campPositions, from, inclusive) {
            var bottomLevel = WorldCreatorHelper.getBottomLevel(seed);
            var start = inclusive ? from : from - 1;
            for (var i = start; i >= bottomLevel; i--) {
                if (campPositions[i] && campPositions[i].length > 0) {
                    return campPositions[i];
                }
            }
            return [];
        },

        isValidCampPos: function (seed, pos, positionsByLevel, features) {
            // blocked: positions in holes etc
            if (WorldCreatorHelper.containsBlockingFeature(pos, features)) return { isValid: false, reason: "blocking feature" };
            // blocked: positions too close to camp positions on previous few levels (so that on levels between them passages up/down don't end up too close)
            var min = 5;
            for (var i = 2; i <= 3; i++) {
                var prevPositions = positionsByLevel[pos.level + i];
                if (!prevPositions) continue;
                for (var j = 0; j < prevPositions.length; j++) {
                    var prevPos = prevPositions[j];
                    var dist = PositionConstants.getDistanceTo(pos, prevPos);
                    if (dist < min) return { isValid: false, reason: "min distance between consecutive camps" };
                }
            }
            // blocked: positions too far away from camp positions on previous two levels level
            var campOrdinal = WorldCreatorHelper.getCampOrdinal(seed, pos.level);
            var maxPathLengthC2P = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE);
            for (var i = 1; i < 3; i++) {
                var prevPositions = positionsByLevel[pos.level + i];
                if (!prevPositions) continue;
                for (var j = 0; j < prevPositions.length; j++) {
                    var prevPos = prevPositions[j];
                    var dist = PositionConstants.getDistanceTo(pos, prevPos);
                    var max = maxPathLengthC2P * (1 + (i-1) * 0.25);
                    if (dist > max) return { isValid: false, reason: "max distance between camps on previous levels ", details: pos + " vs " + prevPos };
                }
            }
            // otherwise ok
            return { isValid: true };
        },
        
        isValidPassageDownPos: function (seed, pos, features, passageUp, campPos1, campPos2) {
            var campOrdinal = Math.min(WorldCreatorHelper.getCampOrdinal(seed, pos.level), WorldCreatorHelper.getCampOrdinal(seed, pos.level - 1));
            var isCampableLevel = WorldCreatorHelper.isCampableLevel(seed, pos.level);
            var maxPathLengthC2P = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE);
            var level = pos.level;
            
            // check blocking features like holes
            if (WorldCreatorHelper.containsBlockingFeature(pos, features)) return { isValid: false, reason: "blocking feature" };
            
            // check that not too close or not too far from camps on this level or the level below
            var allCamps = campPos1.concat(campPos2);
            var minCampDist = 4;
            var maxCampDist = Math.min(20, maxPathLengthC2P);
            for (var i = 0; i < allCamps.length; i++) {
                var campPos = allCamps[i];
                if (campPos.level == pos.level || campPos.level == pos.level - 1) {
                    var dist = Math.round(PositionConstants.getDistanceTo(pos, campPos));
                    var bdist = PositionConstants.getBlockDistanceTo(pos, campPos);
                    if (dist < minCampDist) return { isValid: false, reason: "min distance to camp", details: "camp pos " + campPos + " " + dist + "/" + minCampDist };
                    if (bdist > maxCampDist) return { isValid: false, reason: "max distance to camp", details: "camp pos: " + campPos + " " + bdist + "/" + maxCampDist };
                }
            }
            
            // check that passages on same level are not too close and (on campless levels) not too far
            var maxPathLengthP2P = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE);
            if (passageUp) {
                var minPassageDist = isCampableLevel ? 3 : 8;
                var maxPassageDist = isCampableLevel ? 100 : Math.min(20, maxPathLengthP2P);
                var dist = PositionConstants.getDistanceTo(pos, passageUp);
                if (dist < minPassageDist) return { isValid: false, reason: "min distance to passage up " + passageUp, details: Math.round(dist) + "/" + minPassageDist };
                if (dist > maxPassageDist) return { isValid: false, reason: "max distance to passage up " + passageUp, details: Math.round(dist) + "/" + maxPassageDist };
            }
            
            // check that late passage isn't between early passage and camps on this level (similar direction and shorter distance)
            if (passageUp) {
                var posE = level <= 13 ? passageUp : pos;
                var posL = level <= 13 ? pos : passageUp;
                for (var i = 0; i < allCamps.length; i++) {
                    var campPos = allCamps[i];
                    if (campPos.level == pos.level) {
                        var dirE = PositionConstants.getDirectionFrom(campPos, posE);
                        var dirL = PositionConstants.getDirectionFrom(campPos, posL);
                        var isSame = dirE == dirL;
                        var isNeighbouring = PositionConstants.isNeighbouringDirection(dirE, dirL, true);
                        if (isSame || isNeighbouring) {
                            var distE = PositionConstants.getDistanceTo(campPos, posE);
                            var distL = PositionConstants.getDistanceTo(campPos, posL);
                            if (distL < distE) {
                                return { isValid: false, reason: "late passage closer to camp", details: "level " + level };
                            }
                        }
                    }
                }
            }
            
            return { isValid: true };
        },

    };
    
    return WorldGenerator;
});
