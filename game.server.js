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
		turn: 0,
		last_turn: 0,
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

			player.team = 'spectator';
			player.walk_dir = [0, 0];
			player.unit = _7d.unit.create(state, vars);
			player.moves = [];
			player.last_target = [0, 0, 0];

			player.is_my_turn = function()
			{
				let team = ['red', 'blue'][state.turn % 2];
				if (team == player.team)
				{
					let idx = Math.floor(state.turn / 2) % state.teams[team].players.length;
					return state.teams[team].players.indexOf(player.id) == idx;
				}

				return false;
			}

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

			player.on('do_move', () => {
				if (!player.is_my_turn()) { return; }
				if (player.moves.length > 0) { return; }
				if (!player.nav || !player.nav.path) { return; }
				console.log('start movement');
				player.emit('nav', {choices: [], path: null});
				player.moves = player.nav.path;
				state.turn++;
			});

			player.on('angles', (pitch_yaw) => {
				// if (isNaN(pitch_yaw[0]) || isNaN(pitch_yaw[1])) { return; }  
				player.unit.angles(pitch_yaw[1], pitch_yaw[0]);
				// If the player is moving, don't update nav grid stuff
				if (player.moves.length > 0) { return; }

				let eyes = player.unit.position().add([0, 12, 0]);
				let ray = player.unit.forward().mul(300);
				let int = state.world.intersection(eyes, ray);

				if (int)
				{
					nav_int = state.nav_grid.sample(int.point.add([0, 5, 0]));

					if (!nav_int) { return; }
					nav_int.point = nav_int.point.add([5, 0, 5]);

					if (!player.last_target.eq(nav_int.point))
					{
						if (!player.is_my_turn())
						{
							player.emit('nav', {choices: [], path: null});
							player.emit('selected', -1);
						}
						else
						{
							player.nav = _7d.nav.choices(
								state.nav_grid,
								player.unit.position().add([0, 1, 0]),
								player.unit.action_points(),
								nav_int.point
							);
							player.emit('nav', player.nav);

							if (nav_int.cell < 0)
							{
								var selection = -1;
								for (var i = 0; i < player.nav.choices.length; i++)
								{
									if(player.nav.choices[i].dist(nav_int.point) < 10)
									{
										selection = i;
										break;
									}
								}

								player.emit('selected', selection);
							}
						}
						
					}
					

					

					player.last_target = nav_int.point;
				}
			});

			// player.on('jump', () => {
			// 	if (!player.cam.is_airborn())
			// 	{
			// 		player.cam.velocity(player.cam.velocity().add([0, 6, 0]));
			// 	}
			// });
		},

		update: function(player, state, dt)
		{
			if (player.moves && player.moves.length > 0)
			{
				// console.log('dest ' + player.moves[0]);
				// console.log('player ' + player.unit.position());
				var delta = player.moves[0].sub(player.unit.position());
				// console.log('delta ' + delta);
				// console.log(player.moves);

				if (delta.len() < 0.5)
				{
					console.log('arrived');
					player.moves = player.moves.slice(1);
					player.unit.velocity([0, 0, 0]);
				}
				else
				{
					player.unit.velocity(delta.norm().mul(25));
				}
			}

			player.unit.position(player.unit.position().add(player.unit.velocity().mul(dt)));
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
	update: function(players, state, dt)
	{
		if (state.last_turn != state.turn)
		{
			let next_player = players[_7d.active_player(state)];
			next_player.emit('your_turn');

			next_player.nav = _7d.nav.choices(
				state.nav_grid,
				next_player.unit.position().add([0, 1, 0]),
				next_player.unit.action_points()
			);
			next_player.emit('nav', next_player.nav);
		}

		state.last_turn = state.turn;
	},


	send_states: function(players, state)
	{
		var tx_state = {
			red: {
				players: {}
			},
			blue: {
				players: {}
			},
			turn: state.turn
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

		for (var id in players)
		{
			let player = players[id];
			if (!player.emit) { continue; }
			player.emit('state', tx_state);
		}
	}
};
