
var level_str = 'voxel/level.spawners';

const cam_colision_check = (new_pos, new_vel) => {
    const vox = g.web.assets[level_str];
    return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
};

var state = {
    me: {
        team: 'spectator',
        cam:g.camera.fps({
            collides: cam_colision_check,
            dynamics: function(cam, dt)
            {
                return cam.velocity().mul(0.9);
            }
        })
    },
    rx_state: null,
};
var my_id = null;
var my_team = null;


state.me.cam.position([0, 20, 0]);
// cam.forces.push([0, -9, 0]);
state.me.cam.mass = 0.1;
state.me.cam.force = 1000;
// cam.friction = 5;

var shadow_map = null;
var text_demo = null;
var light = g.camera.create();
var walk_action = [0, 0];
var walk_sounds = [];
var step_cool = 0;

g.web.canvas(document.getElementById('primary'));

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

    console.log(nav_grid);

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

g.initialize(function ()
{
    g.is_running = false;

    // prune out the spawner voxels
    g.web.assets.processors['spawners'] = function(voxel_json)
    {
        for (var vi = 0; vi < voxel_json.XYZI.length; vi++)
        {
            const set = voxel_json.XYZI[vi];
            const color = [ voxel_json.RGBA[set.c-1].r, voxel_json.RGBA[set.c-1].g, voxel_json.RGBA[set.c-1].b ];

            if (color.eq([255, 0, 0]))
            {
                voxel_json.XYZI[vi].c = 1;
            }

            if (color.eq([0, 0, 255]))
            {
                voxel_json.XYZI[vi].c = 1;
            }
        }

        return voxel_json;
    };

    g.web.assets.load(asset_list,
    function() {
        g.web.gfx.shader.create('basic_textured',
            g.web.assets['shaders/basic_textured.vert'],
            g.web.assets['shaders/basic_textured.frag']
        );

        g.web.gfx.shader.create('basic_colored',
            g.web.assets['shaders/basic_colored.vert'],
            g.web.assets['shaders/basic_colored.frag']
        );

        g.web.gfx.shader.create('depth_only',
            g.web.assets['shaders/depth_only.vert'],
            g.web.assets['shaders/depth_only.frag']
        );

        g.web.gfx.shader.create('nav_point',
            g.web.assets['shaders/nav_point.vert'],
            g.web.assets['shaders/nav_point.frag']
        );

        for (var i = 0; i < 4; i++)
        {
            walk_sounds.push(new g.web.assets['sound/step' + (i+1)]([0, 0, 0]));
        }

        shadow_map = g.web.gfx.render_target.create({width: 1024, height: 1024}).shadow_map();

        g.is_running = true;

        // const nav = grid({
        //     "spawn_point_red": [255, 0, 0],
        //     "spawn_point_blue": [0, 0, 255]
        // },
        // 72,
        // g.web.assets[level_str]);
        // g.web.assets[level_str] = g.web.gfx.voxel.create(nav);

        g.web.assets['mesh/nav_point'] = g.web.gfx.mesh.create({
            positions: [[0, 0, 0]]
        });
        g.web.assets['mesh/nav_path'] = g.web.gfx.mesh.create({
            positions: []
        });

        gl.lineWidth(5);
    });

    light.orthographic();

    return true;
});


g.web.pointer.on_move(function (event)
{
    let cam = state.me.cam;
    cam.tilt(event.movementY / 100, event.movementX / 100);

    g.web.signal('angles', [cam.pitch(), cam.yaw()]);
});


g.web.pointer.on_press((event) => {
    g.web._canvas.requestPointerLock();
});


g.web.on('id').do((id) => {
    my_id = id;
    console.log('you are player ' + id);
});

g.web.on('team').do((type_str) => {
    state.me.team = type_str;
    my_team = type_str;
    console.log('you have joined ' + type_str);
});

g.web.on('nav').do((nav) => {
    state.me.nav = nav;

    if (g.web.assets['mesh/nav_path'] && nav.path)
    {
        g.web.assets['mesh/nav_path'].buffer('positions').set_data(nav.path);
    }
});

g.web.on('state').do((s) => {
    let level = g.web.assets[level_str];

    if (!level) { return; }

    state.rx_state = s;

    state.me.cam.position(s[my_team].players[my_id].pos.add([0, 12, 0]).sub(level.center_of_mass()));
    state.me.cam.velocity(s[my_team].players[my_id].vel);
});

g.web.on('selected').do((int) => {
    state.me.selected = int;
});


g.update(function (dt)
{
    var vec = [0, 0];

    state.me.cam.update(dt);

    step_cool -= dt;

    // if (vec.dot(vec) > 0.00001)
    {
        switch (state.me.team)
        {
            case 'spectator':
                if (g.web.key.is_pressed('w')) { vec = vec.add([ 0, 1 ]); }
                if (g.web.key.is_pressed('s')) { vec = vec.add([ 0,-1 ]); }
                if (g.web.key.is_pressed('a')) { vec = vec.add([-1, 0 ]); }
                if (g.web.key.is_pressed('d')) { vec = vec.add([ 1, 0 ]); }
                if (vec[0] != 0) { state.me.cam.walk.right(dt * vec[0]); }
                if (vec[1] != 0) { state.me.cam.walk.forward(dt * vec[1]); }
                break;
            default:
            {
                if (step_cool <= 0)
                {
                    // walk_sounds.pick().position(state.me.cam.position()).play();
                    step_cool = 0.1;
                }

                if (!vec.eq(walk_action))
                {
                    g.web.signal('walk', vec);
                    walk_action = vec;
                }

                if (g.web.key.is_pressed(' '))
                {
                    g.web.signal('do_move');
                }

                                if (vec[0] != 0) { state.me.cam.walk.right(dt * vec[0]); }
                if (vec[1] != 0) { state.me.cam.walk.forward(dt * vec[1]); }

            } break;
        }
    }
});

var t = 0;



const draw_scene = (camera, shader) => {

    let level = g.web.assets[level_str];
    level.using_shader(shader || 'basic_colored')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
        .with_attribute({name:'a_color', buffer: 'colors', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].I(4))
        .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
        .set_uniform('u_light_view').mat4(light.view())
        .set_uniform('u_light_proj').mat4(light.projection())
        .set_uniform('u_light_diffuse').vec3([0.9, 0.7, 0.5])
        .set_uniform('u_light_ambient').vec3([255/255, 106/255, 135/255].mul(0.4))
        .draw_tris();

    // g.web.assets[level_str].using_shader('depth_only')
    //     .with_attribute({name:'a_position', buffer: 'positions', components: 3})
    //     .with_camera(camera)
    //     .set_uniform('u_model').mat4([].I(4))
    //     .draw_lines();

    if (state.me.nav)
    {
        for (var i = 0; i < state.me.nav.choices.length; i++)
        {
            let selected = i == state.me.selected;
            g.web.assets['mesh/nav_point'].using_shader('nav_point')
            .with_attribute({name:'a_position', buffer:'positions', components: 3})
            .with_camera(camera)
            .set_uniform('u_model').mat4([].translate(state.me.nav.choices[i].add([0, -4, 0]).sub(level.center_of_mass())))
            .set_uniform('u_color').vec4(selected ? [0, 1, 0, 1] : [0, 1, 1, 0.5])
            .draw_points();
        }

        g.web.assets['mesh/nav_path'].using_shader('nav_point')
        .with_attribute({name:'a_position', buffer:'positions', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].translate([0, 1, 0].sub(level.center_of_mass())))
        .set_uniform('u_color').vec4([0, 1, 0, 1])
        .draw_line_strip();
    }

    // if (state.me.selected)
    // {
    //     gl.disable(gl.DEPTH_TEST);
    //     if (state.me.selected.point)
    //     g.web.assets['mesh/nav_point'].using_shader('nav_point')
    //     .with_attribute({name:'a_position', buffer:'positions', components: 3})
    //     .with_camera(camera)
    //     .set_uniform('u_model').mat4([].translate(state.me.selected.point.add([0, 0, 0]).sub(level.center_of_mass())))
    //     .set_uniform('u_color').vec4([0, 1, 0, 1])
    //     .draw_points();

    //     gl.enable(gl.DEPTH_TEST);
    // }

    for (var team_name in state.rx_state)
    {
        let team = state.rx_state[team_name];
        for (var id in team.players)
        {
            const p = team.players[id];
            const model = [].quat_rotation([0, 1, 0], 3.1415-p.angs[0]).quat_to_matrix().mat_mul([].translate(p.pos.add([0, 7, 0]).sub(level.center_of_mass())));

            g.web.assets['voxel/assault/legs/0'].using_shader(shader || 'basic_colored')
            .with_attribute({name:'a_position', buffer: 'positions', components: 3})
            .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
            .with_attribute({name:'a_color', buffer: 'colors', components: 3})
            .with_camera(camera)
            .set_uniform('u_model').mat4(model)
            .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
            .set_uniform('u_light_view').mat4(light.view())
            .set_uniform('u_light_proj').mat4(light.projection())
            .set_uniform('u_light_diffuse').vec3([1, 1, 1])
            .set_uniform('u_light_ambient').vec3([135/255, 206/255, 235/255].mul(0.1))
            .draw_tris();
        }
        // if ('depth_only' != shader)
        // if (id == my_id) { continue; }
    }
};

g.web.draw(function (dt)
{
    t += dt;
    if (g.is_running == false) { return; }


    light.look_at([80, 140, -40], [0, 0, 0], [0, 1, 0]);
    shadow_map.bind_as_target();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    draw_scene(light.orthographic(180, 180), 'depth_only');
    shadow_map.unbind_as_target();

    gl.clearColor(140/255, 49/255, 26/255, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw_scene(light.orthographic(180, 180));
    draw_scene(state.me.cam.perspective(Math.PI / 2));
});

