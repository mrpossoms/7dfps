const g = require('./static/js/g.js');
const _7d = require('./static/js/7dfps.js');
const fs = require('fs');
var vars = null;
const level_str = './static/voxels/level.spawners.json';

module.exports.server = {

	// map of all connected players
	players: {},


	// complete game state
	state: {
		nav_grid: null,
		world: null,
		teams: null,
		turn: 0
	},


	// server initialization goes here
	setup: function(state)
	{
		{ // load color mapping
			try
			{
				const text = fs.readFileSync('./vars.json');
				vars = JSON.parse(text);
			}
			catch(e)
			{
				console.log('game variables failed: ' + e);
			}
		}

		state.teams = {
			red: _7d.team.create(state, vars),
			blue: _7d.team.create(state, vars),
		};


		{ // load level
			const path = level_str;
			const text = fs.readFileSync(path);
			var world = null;
			try
			{
				const json = JSON.parse(text);
				_7d.spawn_points(state, json);
				world = g.voxel.create(json);
			}
			catch(e)
			{
				console.log('loading voxels failed: ' + e);
			}
		}

		state.world = world;
		// state.teams.red.spawn_units();
		// state.teams.blue.spawn_units();

		state.nav_grid = _7d.grid(vars.colors, -1, world);
		state.turn = 0;

		console.log('Server initialized');
	},


	// handlers for all player connection events
	player: {
		connected: function(player, state)
		{
			console.log('player: ' + player.id + ' connected');

			// player.cam = g.camera.fps({ collides: cam_colision_check });
			// player.cam.position([0, 20, 0]);
			// player.cam.force = 20;
			// player.cam.friction = 5;
			player.team = 'spectator';
			player.walk_dir = [0, 0];
			player.unit = _7d.unit.create(state, vars);

			let red_team = state.teams.red;
			let blue_team = state.teams.blue;

			if (red_team.players.length  < 3 ||
				blue_team.players.length < 3)
			{
				if (red_team.players.length <= blue_team.players.length)
				{
					console.log('player ' + player.id + " joins red");
					player.team = 'red';
					red_team.players.push(player.id);
					red_team.spawn_player(player);
				}
				else
				{
					console.log('player ' + player.id + " joins blue");
					player.team = 'blue';
					blue_team.players.push(player.id);
					blue_team.spawn_player(player);
				}
			}

			player.emit('id', player.id);
			player.emit('team', player.team);

			// player.on('walk', (walk_dir) => {
			// 	player.walk_dir = walk_dir;
			// });

			player.on('angles', (pitch_yaw) => {
				player.unit.angles(pitch_yaw[1], pitch_yaw[0]);
				// TODO shoot ray here
				let eyes = player.unit.position().add([0, 12, 0]);
				let ray = player.unit.forward().mul(300);
				let int = state.world.intersection(eyes, ray);

				if (int)
				{
					int = state.nav_grid.sample(int.point.add([0, 5, 0]));
					int.point = int.point.add([5, 0, 5]);
					if (int.cell < 0)
					{
						for (var i = 0; i < player.nav_choices.length; i++)
						{
							if(player.nav_choices[i].dist(int.point) < 10)
							{
								player.emit('selected', i);
								break;
							}
						}
					}
				}
			});

			// player.on('jump', () => {
			// 	if (!player.cam.is_airborn())
			// 	{
			// 		player.cam.velocity(player.cam.velocity().add([0, 6, 0]));
			// 	}
			// });
		},

		update: function(player, dt)
		{
			// if (player.walk_dir[0] > 0)      { player.cam.walk.right(dt); }
			// else if (player.walk_dir[0] < 0) { player.cam.walk.left(dt); }

			// if (player.walk_dir[1] > 0)      { player.cam.walk.forward(dt); }
			// else if (player.walk_dir[1] < 0) { player.cam.walk.backward(dt); }

			// player.cam.update(dt);
		},

		disconnected: function(player, state)
		{
			switch(player.team)
			{
				case 'red':
				case 'blue':
					// remove the player's id from their team's player list
					let players = state.teams[player.team].players;
					players.splice(players.indexOf(player.id), 1);
					console.log('player: ' + player.id + ' leaves ' + player.team);
					break;
				default: break;
			}
			console.log('player: ' + player.id + ' disconnected');
		}
	},


	// main game loop
	update: function(players, dt)
	{

	},


	send_states: function(players, state)
	{
		var tx_state = {
			red: {
				players: {}
			},
			blue: {
				players: {}
			}
		};

		for (var team_name in state.teams)
		{
			let team = state.teams[team_name];

			for (var i = 0; i < team.players.length; i++)
			{
				let unit = players[team.players[i]].unit;
				tx_state[team_name].players[team.players[i]] = {
					type: unit.type,
					pos: unit.position(),
					angs: unit.angles()
				};
			}
		}

		// for (var id in players)
		// {
		// 	state.players[id] ={
		// 		pos: players[id].cam.position(),
		// 		vel: players[id].cam.velocity(),
		// 		angs: [players[id].cam.yaw()]
		// 	};
		// }

		for (var id in players)
		{
			let player = players[id];
			if (!player.emit) { continue; }
			player.emit('state', tx_state);

			player.nav_choices = _7d.nav.choices(state.nav_grid, player.unit.position(), player.unit.action_points());
			player.emit('nav', player.nav_choices);
		}
	}
};
