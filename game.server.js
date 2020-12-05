const g = require('./static/js/g.js');
const fs = require('fs');

module.exports.server = {

	// map of all connected players
	players: {},


	// complete game state
	state: {},


	// server initialization goes here
	setup: function(state)
	{
		const crypto = require('crypto');
		const path = './static/voxels/temple.json';

		const text = fs.readFileSync(path);
		console.log(crypto.createHmac('sha256', '1234').update(text).digest('hex'));

		try 
		{
			const json = JSON.parse(text);
			state.world = g.voxel.create(json);
		}
		catch(e)
		{
			console.log('loading voxels failed: ' + e);
		}
		console.log('Server initialized');
	},


	// handlers for all player connection events
	player: {
		connected: function(player, state)
		{
			console.log('player: ' + player.id + ' connected');

			const cam_colision_check = (new_pos, new_vel) => {
				const vox = state.world;
				return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
			};

			player.cam = g.camera.fps({ collides: cam_colision_check });
			player.cam.position([0, 20, 0]);
			player.cam.forces.push([0, -9, 0]);
			player.cam.force = 20;
			player.cam.friction = 5;
			player.walk_dir = [0, 0];

			player.emit('id', player.id);

			player.on('walk', (walk_dir) => {
				player.walk_dir = walk_dir;
			});

			player.on('angles', (pitch_yaw) => {
				player.cam.pitch(pitch_yaw[0]);
				player.cam.yaw(pitch_yaw[1]);
			});

			player.on('jump', () => {
				if (!player.cam.is_airborn())
				{
					player.cam.velocity(player.cam.velocity().add([0, 6, 0]));
				}
			});
		},

		update: function(player, dt)
		{
			if (player.walk_dir[0] > 0)      { player.cam.walk.right(dt); }
			else if (player.walk_dir[0] < 0) { player.cam.walk.left(dt); }

			if (player.walk_dir[1] > 0)      { player.cam.walk.forward(dt); }
			else if (player.walk_dir[1] < 0) { player.cam.walk.backward(dt); }

			player.cam.update(dt);
		},

		disconnected: function(player)
		{
			console.log('player: ' + player.id + ' disconnected');
		}
	},


	// main game loop
	update: function(players, dt)
	{

	},


	send_states: function(players, state)
	{
		var state = {
			players: {}
		};

		for (var id in players)
		{
			state.players[id] ={
				pos: players[id].cam.position(),
				vel: players[id].cam.velocity(),
				angs: [players[id].cam.yaw()]
			};
		}

		for (var id in players)
		{
			if (!players[id].emit) { continue; }
			players[id].emit('state', state);
		}
	}
};
