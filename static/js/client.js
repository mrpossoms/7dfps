
const cam_colision_check = (new_pos, new_vel) => {
    const vox = g.web.assets['voxel/temple'];
    return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
}

var state = {};
var my_id = null;

var cam = g.camera.fps({
    collides: cam_colision_check
});

cam.position([0, 20, 0]);
cam.forces.push([0, -9, 0]);
cam.force = 20;
cam.friction = 5;

var shadow_map = null;
var text_demo = null;
var light = g.camera.create();
var walk_action = [0, 0];
var walk_sounds = [];
var step_cool = 0;

g.web.canvas(document.getElementById('primary'));

g.initialize(function ()
{
    g.is_running = false;

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

        for (var i = 0; i < 4; i++)
        {
            walk_sounds.push(new g.web.assets['sound/step' + (i+1)]([0, 0, 0]));
        }

        shadow_map = g.web.gfx.render_target.create({width: 2048, height: 2048}).shadow_map();
        text_demo = g.web.gfx.text.create(128, 32, "32px Arial").text("hello, world");

        g.is_running = true;
    });

    light.orthographic();

    return true;
});


g.web.pointer.on_move(function (event)
{
    cam.tilt(event.movementY / 100, event.movementX / 100);

    g.web.signal('angles', [cam.pitch(), cam.yaw()]);
});


g.web.pointer.on_press((event) => {
    g.web._canvas.requestPointerLock();
});


g.web.on('id').do((id) => {
    my_id = id;
});


g.web.on('state').do((s) => {
    state = s;

    cam.position(s.players[my_id].pos);
    cam.velocity(s.players[my_id].vel);
});


g.update(function (dt)
{
    var vec = [0, 0];

    const forward = cam.forward();
    const up = cam.up();
    const left = cam.left();

    cam.update(dt);

    step_cool -= dt;

    if (g.web.key.is_pressed('w')) { vec = vec.add([ 0, 1 ]); }
    if (g.web.key.is_pressed('s')) { vec = vec.add([ 0,-1 ]); }
    if (g.web.key.is_pressed('a')) { vec = vec.add([-1, 0 ]); }
    if (g.web.key.is_pressed('d')) { vec = vec.add([ 1, 0 ]); }

    if (vec.dot(vec) > 0.00001)
    {
        if (step_cool <= 0)
        {
            walk_sounds.pick().position(cam.position()).play();
            step_cool = 0.1;
        }
    }

    if (!vec.eq(walk_action))
    {
        g.web.signal('walk', vec);
        walk_action = vec;
    }
    if (g.web.key.is_pressed(' ') && !cam.is_airborn())
    {
        g.web.signal('jump');
    }
});

var t = 0;



const draw_scene = (camera, shader) => {

    g.web.assets['voxel/temple'].using_shader(shader || 'basic_colored')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
        .with_attribute({name:'a_color', buffer: 'colors', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].I(4))
        .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
        .set_uniform('u_light_view').mat4(light.view())
        .set_uniform('u_light_proj').mat4(light.projection())
        .set_uniform('u_light_diffuse').vec3([1, 1, 1])
        .set_uniform('u_light_ambient').vec3([135/255, 206/255, 235/255].mul(0.1))
        .draw_tris();

    g.web.assets['voxel/temple'].using_shader('depth_only')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].I(4))
        .draw_lines();

    g.web.assets['mesh/exported-cube'].using_shader(shader || 'basic_textured')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_attribute({name:'a_tex_coord', buffer: 'texture_coords', components: 2})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].translate(camera.position().add([3, 1, 0])))
        .set_uniform('u_texture').texture(text_demo)
        .draw_tris();

    for (var id in state.players)
    {
        if ('depth_only' != shader)
        if (id == my_id) { continue; }

        const p = state.players[id];
        const model = [].quat_rotation([0, 1, 0], 3.1415-p.angs[0]).quat_to_matrix().mat_mul([].translate(p.pos.add([0, 0.5, 0])));

        g.web.assets['voxel/knight'].using_shader(shader || 'basic_colored')
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
};

g.web.draw(function (dt)
{
    t += dt;
    if (g.is_running == false) { return; }


    light.look_at([Math.sin(t * 0.1) * 20, 52, Math.cos(t * 0.1) * 20], [0, 0, 0], [0, 1, 0]);
    shadow_map.bind_as_target();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    draw_scene(light.perspective(Math.PI / 4), 'depth_only');
    shadow_map.unbind_as_target();

    gl.clearColor(135/255, 206/255, 235/255, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    draw_scene(cam.perspective(Math.PI / 2));
});

