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
	choices: function(nav_grid, start_point, action_points)
	{
		var visited = {};
		var choices = [];
		const s = nav_grid.scale;

		var walk = (x, y, z, points) => {
			if (x < 0 || x >= nav_grid.width) { return; }
			if (y < 0 || y >= nav_grid.height) { return; }
			if (z < 0 || z >= nav_grid.depth) { return; }

			let id = x+':'+y+':'+z;

			if (points < 0) { return; }
			if (visited[id] > points) { return; }
			if (nav_grid.cells[x][y][z] >= 0) { return; }

			let point = [x, y, z].add([0.5, 0.5, 0.5]).mul(s);
			choices.push(point);

			visited[id] = points;

			walk(x,y,z+1, points - 1);
			walk(x,y,z-1, points - 1);
			walk(x+1,y,z, points - 1);
			walk(x-1,y,z, points - 1);
			walk(x,y+1,z, points - 1);
			walk(x,y-1,z, points - 1);
		};
		walk(Math.floor(start_point[0] / s), Math.floor(start_point[1] / s), Math.floor(start_point[2] / s), action_points);

		return choices;
	}
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
		var hp = game_vars.units[type];
		var action_points = game_vars.player.action_points;

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
				hp = game_vars.units[type];
				return this;
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
			position: function(pos) { return cam.position(pos); },
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
	create: function(state, game_vars)
	{
		var spawn_points = [];
		var players = [];
		// // create one unit for each class
		// for (var unit_class in game_vars.units)
		// {
		// 	let u = unit.create(state, game_vars, unit_class);
		// 	units.push(u);
		// }

		return {
			// units: units,
			players: players,
			spawn_points: spawn_points,
			spawn_player: function(player) {
				let idx = players.indexOf(player.id);
				player.unit.reset().position(spawn_points[idx].add([5, 0, 5]));
				console.log('player ' + player.id + ' spawned at ' + spawn_points[idx]);
			}
			// spawn_units: function()
			// {
			// 	for (var i = 0; i < spawn_points.length; i++)
			// 	{
			// 		units[i].reset().position(spawn_points[i].sub(state.world.center_of_mass()));
			// 	}
			// }
		};
	}
};


try
{
	module.exports = {
		grid: grid,
		unit: unit,
		team: team,
		spawn_points: spawn_points,
		nav: nav
	};
}
catch(e)
{
	console.log('Not a node.js module');
}
