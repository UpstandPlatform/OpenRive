# Rive Markup Language (RML)

[RML](https://rive.app/docs/runtimes/advanced-topic/rml) is the XML form of a Rive file that the Rive CLI
compiles: every element is a Rive type, every attribute one of its properties, and nesting expresses the
hierarchy. OpenRive reads it, so a scene written by hand or by a coding agent becomes a `.riv` without a
Rive account, a publish allowance or a watermark.

```xml
<Rive version="1" kind="fragment">
  <Artboard defaultStateMachineId="0:7" width="400" height="300" name="Hello" id="0:2">
    <Shape x="200" y="150" name="Dot" id="0:14">
      <Ellipse width="160" height="160"/>
      <Fill><SolidColor colorValue="FFFF2D8A"/></Fill>
    </Shape>
    <LinearAnimation duration="60" loopValue="pingPong" name="pulse" id="0:20">
      <KeyedObject objectId="0:14">
        <KeyedProperty property="scaleX">
          <KeyFrameDouble frame="0" value="1" interpolationType="linear"/>
          <KeyFrameDouble frame="60" value="1.4"/>
        </KeyedProperty>
      </KeyedObject>
    </LinearAnimation>
    <StateMachine name="Main" id="0:7">
      <StateMachineLayer>
        <EntryState><StateTransition stateToId="0:30"/></EntryState>
        <AnimationState animationId="0:20" id="0:30"/>
      </StateMachineLayer>
    </StateMachine>
  </Artboard>
</Rive>
```

## Compile or import

```sh
openrive rml ./scene.rml hello.riv       # one file
openrive rml ./myproject                 # a Rive CLI project folder → myproject.riv
openrive rml ./myproject out.riv --json  # machine-readable result and warnings
openrive import ./myproject              # open it as an editable OpenRive project
```

A project folder compiles every `.rml` file in path order, like the Rive CLI. `rive.yaml` gives the project
`name` and its `main` artboard, which is written first. Assets are read from `file="…"` paths inside the folder.

From code, `importRml(sources, options)` in `@openrive/rive/rml` returns a document for `exportRiv()`.

## What matches the Rive CLI

The importer reproduces what the CLI adds on top of the markup: editor defaults (`clip`, layout units, scroll
`threshold`), enum names (`layoutWidthScaleType="fill"`, `listenerTypeValue="down"`, key names), editor flag
attributes (`hidden`, `isTargetOpaque`, `enableEarlyExit`, `canFocus`, …), `property="x"` on keyed properties,
data bind paths (`sourcePathIds="0:40-0:42"`), the Any/Exit/Entry states of each layer, and the order objects
and properties are written in.

`bun run test:rml-corpus -- <rive-runtime>/tests` compiles the `.rml` scenes in Rive's own test suite and
compares them with the `.riv` files the CLI built from them. Every scene built by the current CLI comes out
byte-identical. Files built by older CLI releases differ only in editor defaults those releases used.

Like the current CLI, `openrive rml` leaves out layer names and the names of animations only a state machine
plays. `openrive import` keeps them, since the editor shows them.

## Not supported

- **Luau scripts** (`ScriptAsset`, `Scripted*`): the runtimes only play scripts signed by Rive.
- **Bundles** (`kind="bundle"`, the Editor's export with a `Backboard`): the `Backboard` is skipped.
- Unknown elements and attribute values are reported as warnings and left out.
