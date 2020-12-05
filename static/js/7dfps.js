/**
 *
 */
function grid(color_mapping, nav_cell_idx, voxel)
{
	// find a spawn point to start at
	var spawn_point = [0, 0, 0];
	var spawn_color = color_mapping.spawn_point_red.mul(1/255);
	voxel.each_voxel((x, y, z) => {
		const color = voxel.palette[voxel.cells[x][y][z]];
		if (spawn_color.eq(color))
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


let unit = {
	create: function(state, game_vars)
	{
		const cam_colision_check = (new_pos, new_vel) => {
			const vox = state.world;
			return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
		};

		var cam = g.camera.fps({ collides: cam_colision_check });
		var type = "assault";
		var hp = game_vars.units[type];

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

				return [game.yaw(), cam.pitch()];
			},
			position: function(pos) { return cam.position(pos); },
			velocity: function(vel) { return cam.velocity(vel); },
		};
	}
}

let team = {
	create: function(state, game_vars)
	{
		var units = [];

		// create one unit for each class
		for (var unit_class in game_vars.units)
		{
			units.push(unit.create(state, unit_class));
		}

		return {
			units: units,
		};
	}
};


try
{
	module.exports = {
		grid: grid,
		unit: unit,
		team: team
	};
}
catch(e)
{
	console.log('Not a node.js module');
}
