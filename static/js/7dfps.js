const g = require('./g.js');

/**
 *
 */
function grid(color_mapping, nav_cell_idx, voxel)
{
	// find a spawn point to start at
	var spawn_point = [0, 0, 0];
	var spawn_color_red = color_mapping.spawn_point_red.mul(1/255);
	var spawn_color_blue = color_mapping.spawn_point_blue.mul(1/255);
	voxel.each_voxel((x, y, z) => {
		const color = voxel.palette[voxel.cells[x][y][z]];
		if (spawn_color_red.eq(color) || spawn_color_blue.eq(color))
		{
			spawn_point = [x, y, z];
			return true; // marks that we are done
		}
	});

	var nav_grid = voxel.downsample(10);

	let flood_fill = (x, y, z) => {
		if (x < 0 || x >= nav_grid.width) { return; }
		if (y < 0 || y >= nav_grid.height) { return; }
		if (z < 0 || z >= nav_grid.depth) { return; }
		var below = 0;
		if (y - 1 >= 0) below = nav_grid.cells[x][y - 1][z];
		if (nav_grid.cells[x][y][z] != 0 || below == nav_cell_idx || below == 0)
		{ return; }

		nav_grid.cells[x][y][z] = nav_cell_idx;

		flood_fill(x - 1, y, z);
		flood_fill(x - 1, y + 1, z);
		flood_fill(x + 1, y, z);
		flood_fill(x + 1, y + 1, z);
		flood_fill(x, y, z + 1);
		flood_fill(x, y + 1, z + 1);
		flood_fill(x, y, z - 1);
		flood_fill(x, y + 1, z - 1);
	};

	spawn_point = spawn_point.mul(1/10).floor();
	flood_fill(spawn_point[0], spawn_point[1], spawn_point[2]);

	return nav_grid;
}

const nav = {
	choices: function(nav_grid, start_point, action_points, target_point)
	{
		var visited = {};
		var choices = [];
		const s = nav_grid.scale;

		if (target_point)
		{
			target_point = target_point.mul(1 / s).floor();
		}

		var walk = (x, y, z, points) => {
			if (points < 0) { return null; }
			if (x < 0 || x >= nav_grid.width) { return null; }
			if (y < 0 || y >= nav_grid.height) { return null; }
			if (z < 0 || z >= nav_grid.depth) { return null; }
			if (nav_grid.cells[x][y][z] >= 0) { return null; }
			let id = x+':'+y+':'+z;
			if (visited[id] && visited[id].points >= points) { return null; }


			visited[id] = {
				points: points,
				coord: [x, y, z]
			};

			var path_segs = [
				walk(x,y,z+1, points - 1),
				walk(x,y+1,z+1, points - 1),
				walk(x,y-1,z+1, points - 1),
				walk(x,y,z-1, points - 1),
				walk(x,y+1,z-1, points - 1),
				walk(x,y-1,z-1, points - 1),
				walk(x+1,y,z, points - 1),
				walk(x+1,y+1,z, points - 1),
				walk(x+1,y-1,z, points - 1),
				walk(x-1,y,z, points - 1),
				walk(x-1,y+1,z, points - 1),
				walk(x-1,y-1,z, points - 1),
			];

			if (target_point && [x, y, z].dist(target_point) < 0.001)
			{
				return [[x, y, z]];
			}

			var shortest = null;
			var shortest_len = 10000;

			for (var i = 0; i < path_segs.length; i++)
			{
				if (path_segs[i])
				if (path_segs[i].length < shortest_len)
				{
					shortest_len = path_segs[i].length;
					shortest = path_segs[i];
				}
			}

			if (shortest == null) { return null; }
			return [[x, y, z]].concat(shortest);
		};

		var path = walk(Math.floor(start_point[0] / s), Math.floor(start_point[1] / s), Math.floor(start_point[2] / s), action_points);
		for (var key in visited)
		{
			choices.push(
	        	visited[key].coord.add([0.5, 0.5, 0.5]).mul(s)
			);
		}

		if (path)
		for (var i = 0; i < path.length; i++)
		{
	        path[i] = path[i].add([0.5, 0.0, 0.5]).mul(s);
		}

		return {
			choices: choices,
			path: path
		};
	}
}

function active_player(state, players_map)
{
	let living_blue = state.teams.blue.living_players(players_map);
	let living_red = state.teams.red.living_players(players_map);
	let teams = [];

	if (living_blue.length > 0) { teams.push(living_blue); }
	if (living_red.length > 0) { teams.push(living_red); }

	if (teams.length == 0) { return null; }

	let team_living = teams[state.turn % teams.length];
	let idx = Math.floor(state.turn / teams.length) % team_living.length;		

	return team_living[idx];
}


function spawn_points(state, voxel_json)
{
    for (var vi = 0; vi < voxel_json.XYZI.length; vi++)
    {
        const set = voxel_json.XYZI[vi];
        const color = [ voxel_json.RGBA[set.c-1].r, voxel_json.RGBA[set.c-1].g, voxel_json.RGBA[set.c-1].b ];

        if (color.eq([255, 0, 0]))
        {
        	state.teams.red.spawn_points.push([set.x, set.z, set.y]);
            // voxel_json.XYZI[vi].c = 1;
        }

        if (color.eq([0, 0, 255]))
        {
        	state.teams.blue.spawn_points.push([set.x, set.z, set.y]);
            // voxel_json.XYZI[vi].c = 1;
        }
    }

    return voxel_json;
};

let unit = {
	create: function(state, game_vars, unit_class)
	{
		const cam_colision_check = (new_pos, new_vel) => {
			const vox = state.world;
			return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
		};

		var cam = g.camera.fps({ collides: cam_colision_check });
		var type = unit_class || "assault";
		const unit_stats = game_vars.units[type];
		var hp = unit_stats.hp;
		var ammo = unit_stats.weapon.capacity;
		var action_points = game_vars.player.action_points;
		var crouching = false;
		cam.friction = 5;
		cam.forces.push([0, -9, 0]);

		return {
			type: function(type_str)
			{
				if (type_str) { type = type_str; }

				return type;
			},
			hp: function(_hp)
			{
				if (_hp) { hp = _hp; }
				return hp;
			},
			reset: function()
			{
				ammo = game_vars.units[type].weapon.capacity;
				hp = game_vars.units[type].hp;
				return this;
			},
			force: function(force, dt)
			{
				cam.force(force, dt);
			},
			update: function(dt)
			{
				cam.update(dt);
			},
			angles: function(yaw, pitch)
			{
				if (yaw || pitch)
				{
					cam.yaw(yaw);
					cam.pitch(pitch);
				}

				return [cam.yaw(), cam.pitch()];
			},
			forward: function()
			{
				return cam.forward();
			},
			ammo: function (a)
			{
				if (undefined != a) { ammo = a; }

				return ammo;
			},
			crouching: function(c) { if (c != undefined) { crouching = c; } return crouching;},
			reload: function()
			{
				ammo = game_vars.units[type].weapon.capacity;
			},
			position: function(pos) { return cam.position(pos); },
			eyes: function() { return cam.position().add([0, 12 * (crouching ? (25/39) : 1), 0]); },
			velocity: function(vel) { return cam.velocity(vel); },
			action_points: function(pts)
			{
				if (pts) { action_points = pts; }
				return action_points;
			}
		};
	}
}

let team = {
	create: function(state, game_vars, name)
	{
		var spawn_points = [];
		var players = [];
		var unit_idx_offset = parseInt(Math.random() * 3);
		// // create one unit for each class
		// for (var unit_class in game_vars.units)
		// {
		// 	let u = unit.create(state, game_vars, unit_class);
		// 	units.push(u);
		// }
		let spawn_player = function(player) {
			if (!player) { return; }
			let idx = players.indexOf(player.id) + unit_idx_offset + state.round;
			let unit_class = ['assault', 'sniper', 'shotgun'][idx % 3];
			let class_stats = game_vars.units[unit_class];
			player.team = name;
			player.unit.reset().position(spawn_points[idx % spawn_points.length].add([5, 0, 5]));
			player.unit.type(unit_class);
			player.unit.hp(class_stats.hp);
			console.log('player ' + player.id + ' spawned as ' + unit_class + ' at ' + spawn_points[idx % spawn_points.length]);
		};

		return {
			// units: units,
			players: players,
			spawn_points: spawn_points,
			spawn_player: spawn_player,
			living_players: function(players_map)
			{
				return players.reduce((acc, val) => {
					if (players_map[val] && players_map[val].unit.hp() > 0)
					{
						return acc.concat(val);
					}
					return acc;
				}, []);
			},
			reset: function(players_map)
			{
				let idx = 0;
				for (var i = 0; i < players.length; i++)
				{
					let p = players_map[players[i]];
					spawn_player(p);		
				}
			}
		};
	}
};

let projectile_batch = {
	create: function(max_projectiles, drag)
	{
		var projectiles = [];
		var accelerations = [];
		var drag = drag || 0;
		var impacts = [];

		var active_projectiles = 0;

		for (var i = 0; i < max_projectiles; i++)
		{
			projectiles.push({
				pos: [0, 0, 0],
				vel: [0, 0, 0],
				mass: 0,
				life: 10,
				owner: -1
			});
		}

		function swap(i, j)
		{
			let tmp = projectiles[i];
			projectiles[i] = projectiles[j];
			projectiles[j] = tmp;
		}

		function kill(idx)
		{
			if (active_projectiles == 0) { return; }
			swap(idx, active_projectiles - 1);
			active_projectiles--;
		}

		return {
			accelerations: function() { return accelerations; },
			update: function(world, players, dt)
			{
				for (var i = 0; i < active_projectiles; i++)
				{
					let p = projectiles[i];
					p.life -= dt;
					if (p.life <= 0) { kill(i); }
				}

				for (var i = 0; i < active_projectiles; i++)
				{
					let p = projectiles[i];
					let vel_dt = p.vel.mul(dt);
				
					for (var j = 0; j < accelerations.length; j++)
					{
						p.vel = p.vel.add(accelerations[j].mul(dt));
					}

					let drag_vec = p.vel.mul(p.vel.dot(p.vel) * dt * drag);
					p.vel = p.vel.sub(drag_vec);

					let int = world.intersection(p.pos, vel_dt);
					if (int)
					{
						// p.vel = p.vel.sub(int.normal.mul(int.normal.dot(p.vel) * 2));
						kill(i);
						impacts.push(int.point);
						continue;
					}

					for (var id in players)
					{
						if (p.owner == id) { continue; } // don't collide with owner
						let player = players[id];

						var collided = false;
						var crouch_scale = player.unit.crouching() ? 0.5 : 1;
						for (var k = 0; k < 2; k++)
						{
							let t = Math.ray({position: p.pos, direction: vel_dt}).intersects.sphere(player.unit.position().add([0, k * 5 * crouch_scale, 0]), 5);

							if (t > 0 && t < 1)
							{
								collided = true;
								impacts.push(p.pos.add(vel_dt.mul(t)));
								break;
							}	
						}

						// TODO: do damage to player
						if (collided)
						{
							let dmg = p.vel.len() * p.mass;
							// console.log('owner ' + p.owner + ' hit ' + id + ' for ' + dmg + ' damage');
							player.accumulated_damage += dmg;
							kill(i);
						}
					}



					p.pos = p.pos.add(vel_dt);
				}
			},
			spawn: function(pos, vel, mass, owner)
			{
				if (active_projectiles < max_projectiles)
				{
					projectiles[active_projectiles].pos = pos;
					projectiles[active_projectiles].vel = vel;
					projectiles[active_projectiles].mass = mass;
					projectiles[active_projectiles].owner = owner;
					projectiles[active_projectiles].life = 2;
					active_projectiles++;
				}
			},
			kill: kill,
			active: function()
			{
				return projectiles.slice(0, active_projectiles);
			},
			impacts: function() { let out = impacts.slice(); impacts = []; return out; }
		}
	}
};

try
{
	module.exports = {
		grid: grid,
		unit: unit,
		team: team,
		spawn_points: spawn_points,
		nav: nav,
		active_player: active_player,
		projectile_batch: projectile_batch
	};
}
catch(e)
{
	console.log('Not a node.js module');
}
