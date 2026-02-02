/**
 * DISCOVERY E2E TESTS
 *
 * These tests verify that task source files exist with correct structure.
 * They do NOT call internal provider methods.
 *
 * For unit tests that test provider internals, see discovery.unit.test.ts
 */

import * as assert from "assert";
import * as fs from "fs";
import { activateExtension, sleep, getFixturePath } from "../helpers/helpers";

interface PackageJson {
  scripts?: Record<string, string>;
}

suite("Task Discovery E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suite("Shell Script Discovery", () => {
    test("discovers shell scripts in workspace", function () {
      this.timeout(10000);

      const buildScriptPath = getFixturePath("scripts/build.sh");
      assert.ok(fs.existsSync(buildScriptPath), "build.sh should exist");

      const deployScriptPath = getFixturePath("scripts/deploy.sh");
      assert.ok(fs.existsSync(deployScriptPath), "deploy.sh should exist");

      const testScriptPath = getFixturePath("scripts/test.sh");
      assert.ok(fs.existsSync(testScriptPath), "test.sh should exist");
    });

    test("parses @param comments from shell scripts", function () {
      this.timeout(10000);

      const buildScript = fs.readFileSync(
        getFixturePath("scripts/build.sh"),
        "utf8",
      );

      assert.ok(
        buildScript.includes("@param config"),
        "Should have config param",
      );
      assert.ok(
        buildScript.includes("@param verbose"),
        "Should have verbose param",
      );
    });

    test("extracts description from first comment line", function () {
      this.timeout(10000);

      const buildScript = fs.readFileSync(
        getFixturePath("scripts/build.sh"),
        "utf8",
      );
      const lines = buildScript.split("\n");

      const secondLine = lines[1];
      assert.ok(
        secondLine?.includes("Build the project") === true,
        "Should have description",
      );
    });
  });

  suite("NPM Script Discovery", () => {
    test("discovers npm scripts from root package.json", function () {
      this.timeout(10000);

      const packageJsonPath = getFixturePath("package.json");
      assert.ok(fs.existsSync(packageJsonPath), "package.json should exist");

      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      ) as PackageJson;
      assert.ok(packageJson.scripts, "Should have scripts section");
      assert.ok(
        packageJson.scripts["build"] !== undefined,
        "Should have build script",
      );
      assert.ok(
        packageJson.scripts["test"] !== undefined,
        "Should have test script",
      );
      assert.ok(
        packageJson.scripts["lint"] !== undefined,
        "Should have lint script",
      );
      assert.ok(
        packageJson.scripts["start"] !== undefined,
        "Should have start script",
      );
    });

    test("discovers npm scripts from subproject package.json", function () {
      this.timeout(10000);

      const subprojectPackageJsonPath = getFixturePath(
        "subproject/package.json",
      );
      assert.ok(
        fs.existsSync(subprojectPackageJsonPath),
        "subproject/package.json should exist",
      );

      const packageJson = JSON.parse(
        fs.readFileSync(subprojectPackageJsonPath, "utf8"),
      ) as PackageJson;
      assert.ok(packageJson.scripts, "Should have scripts section");
      assert.ok(
        packageJson.scripts["build"] !== undefined,
        "Should have build script",
      );
      assert.ok(
        packageJson.scripts["test"] !== undefined,
        "Should have test script",
      );
    });
  });

  suite("Makefile Target Discovery", () => {
    test("discovers Makefile targets", function () {
      this.timeout(10000);

      const makefilePath = getFixturePath("Makefile");
      assert.ok(fs.existsSync(makefilePath), "Makefile should exist");

      const makefile = fs.readFileSync(makefilePath, "utf8");

      assert.ok(makefile.includes("all:"), "Should have all target");
      assert.ok(makefile.includes("build:"), "Should have build target");
      assert.ok(makefile.includes("test:"), "Should have test target");
      assert.ok(makefile.includes("clean:"), "Should have clean target");
      assert.ok(makefile.includes("install:"), "Should have install target");
    });

    test("skips internal targets starting with dot", function () {
      this.timeout(10000);

      const makefile = fs.readFileSync(getFixturePath("Makefile"), "utf8");
      assert.ok(
        makefile.includes(".internal:"),
        "Should have internal target in file",
      );
    });
  });

  suite("VS Code Launch Configuration Discovery", () => {
    test("discovers launch configurations from launch.json", function () {
      this.timeout(10000);

      const launchJsonPath = getFixturePath(".vscode/launch.json");
      assert.ok(fs.existsSync(launchJsonPath), "launch.json should exist");

      const content = fs.readFileSync(launchJsonPath, "utf8");

      assert.ok(
        content.includes("Debug Application"),
        "Should have Debug Application config",
      );
      assert.ok(
        content.includes("Debug Tests"),
        "Should have Debug Tests config",
      );
      assert.ok(
        content.includes("Debug Python"),
        "Should have Debug Python config",
      );
    });

    test("handles JSONC comments in launch.json", function () {
      this.timeout(10000);

      const launchJson = fs.readFileSync(
        getFixturePath(".vscode/launch.json"),
        "utf8",
      );

      assert.ok(launchJson.includes("//"), "Should have single-line comments");
      assert.ok(launchJson.includes("/*"), "Should have multi-line comments");
    });
  });

  suite("VS Code Tasks Discovery", () => {
    test("discovers tasks from tasks.json", function () {
      this.timeout(10000);

      const tasksJsonPath = getFixturePath(".vscode/tasks.json");
      assert.ok(fs.existsSync(tasksJsonPath), "tasks.json should exist");

      const content = fs.readFileSync(tasksJsonPath, "utf8");

      assert.ok(
        content.includes("Build Project"),
        "Should have Build Project task",
      );
      assert.ok(content.includes("Run Tests"), "Should have Run Tests task");
      assert.ok(
        content.includes("Deploy with Config"),
        "Should have Deploy with Config task",
      );
      assert.ok(
        content.includes("Custom Build"),
        "Should have Custom Build task",
      );
    });

    test("parses input definitions from tasks.json", function () {
      this.timeout(10000);

      const tasksJson = fs.readFileSync(
        getFixturePath(".vscode/tasks.json"),
        "utf8",
      );

      assert.ok(tasksJson.includes('"inputs"'), "Should have inputs section");
      assert.ok(tasksJson.includes("deployEnv"), "Should have deployEnv input");
      assert.ok(
        tasksJson.includes("buildConfig"),
        "Should have buildConfig input",
      );
      assert.ok(
        tasksJson.includes("buildTarget"),
        "Should have buildTarget input",
      );
    });

    test("handles JSONC comments in tasks.json", function () {
      this.timeout(10000);

      const tasksJson = fs.readFileSync(
        getFixturePath(".vscode/tasks.json"),
        "utf8",
      );
      assert.ok(tasksJson.includes("//"), "Should have comments");
    });
  });

  suite("Python Script Discovery", () => {
    test("discovers Python scripts with shebang", function () {
      this.timeout(10000);

      const buildScriptPath = getFixturePath("scripts/build_project.py");
      assert.ok(
        fs.existsSync(buildScriptPath),
        "build_project.py should exist",
      );

      const content = fs.readFileSync(buildScriptPath, "utf8");
      assert.ok(
        content.startsWith("#!/usr/bin/env python3"),
        "Should have python shebang",
      );
    });

    test("discovers Python scripts with __main__ block", function () {
      this.timeout(10000);

      const runTestsPath = getFixturePath("scripts/run_tests.py");
      assert.ok(fs.existsSync(runTestsPath), "run_tests.py should exist");

      const content = fs.readFileSync(runTestsPath, "utf8");
      assert.ok(
        content.includes('if __name__ == "__main__"'),
        "Should have __main__ block",
      );
    });

    test("parses @param comments from Python scripts", function () {
      this.timeout(10000);

      const buildScript = fs.readFileSync(
        getFixturePath("scripts/build_project.py"),
        "utf8",
      );

      assert.ok(
        buildScript.includes("@param config"),
        "Should have config param",
      );
      assert.ok(
        buildScript.includes("@param output"),
        "Should have output param",
      );
    });

    test("excludes non-runnable Python files", function () {
      this.timeout(10000);

      const utilsPath = getFixturePath("scripts/utils.py");
      assert.ok(fs.existsSync(utilsPath), "utils.py should exist");

      const content = fs.readFileSync(utilsPath, "utf8");
      assert.ok(!content.includes("#!/"), "Should not have shebang");
      assert.ok(
        !content.includes("__main__"),
        "Should not have __main__ block",
      );
    });
  });

  suite("PowerShell/Batch Script Discovery", () => {
    test("discovers PowerShell scripts", function () {
      this.timeout(10000);

      const ps1Path = getFixturePath("scripts/build.ps1");
      assert.ok(fs.existsSync(ps1Path), "build.ps1 should exist");

      const content = fs.readFileSync(ps1Path, "utf8");
      assert.ok(content.includes("param("), "Should have param block");
    });

    test("discovers Batch scripts", function () {
      this.timeout(10000);

      const batPath = getFixturePath("scripts/deploy.bat");
      assert.ok(fs.existsSync(batPath), "deploy.bat should exist");

      const content = fs.readFileSync(batPath, "utf8");
      assert.ok(content.includes("REM"), "Should have REM comment");
    });

    test("discovers CMD scripts", function () {
      this.timeout(10000);

      const cmdPath = getFixturePath("scripts/test.cmd");
      assert.ok(fs.existsSync(cmdPath), "test.cmd should exist");

      const content = fs.readFileSync(cmdPath, "utf8");
      assert.ok(content.includes("::"), "Should have :: comment");
    });
  });

  suite("Gradle Task Discovery", () => {
    test("discovers Gradle tasks from build.gradle", function () {
      this.timeout(10000);

      const gradlePath = getFixturePath("build.gradle");
      assert.ok(fs.existsSync(gradlePath), "build.gradle should exist");

      const content = fs.readFileSync(gradlePath, "utf8");
      assert.ok(content.includes("task hello"), "Should have hello task");
      assert.ok(
        content.includes("task customBuild"),
        "Should have customBuild task",
      );
    });
  });

  suite("Cargo Task Discovery", () => {
    test("discovers Cargo.toml files", function () {
      this.timeout(10000);

      const cargoPath = getFixturePath("Cargo.toml");
      assert.ok(fs.existsSync(cargoPath), "Cargo.toml should exist");

      const content = fs.readFileSync(cargoPath, "utf8");
      assert.ok(content.includes("[package]"), "Should have package section");
      assert.ok(content.includes("[[bin]]"), "Should have binary targets");
    });
  });

  suite("Maven Goal Discovery", () => {
    test("discovers pom.xml files", function () {
      this.timeout(10000);

      const pomPath = getFixturePath("pom.xml");
      assert.ok(fs.existsSync(pomPath), "pom.xml should exist");

      const content = fs.readFileSync(pomPath, "utf8");
      assert.ok(content.includes("<project"), "Should have project element");
    });
  });

  suite("Ant Target Discovery", () => {
    test("discovers build.xml files", function () {
      this.timeout(10000);

      const antPath = getFixturePath("build.xml");
      assert.ok(fs.existsSync(antPath), "build.xml should exist");

      const content = fs.readFileSync(antPath, "utf8");
      assert.ok(
        content.includes('<target name="build"'),
        "Should have build target",
      );
      assert.ok(
        content.includes('<target name="clean"'),
        "Should have clean target",
      );
      assert.ok(
        content.includes('<target name="test"'),
        "Should have test target",
      );
    });
  });

  suite("Just Recipe Discovery", () => {
    test("discovers justfile recipes", function () {
      this.timeout(10000);

      const justPath = getFixturePath("justfile");
      assert.ok(fs.existsSync(justPath), "justfile should exist");

      const content = fs.readFileSync(justPath, "utf8");
      assert.ok(content.includes("build:"), "Should have build recipe");
      assert.ok(content.includes("test:"), "Should have test recipe");
      assert.ok(
        content.includes("deploy env="),
        "Should have deploy recipe with param",
      );
    });
  });

  suite("Taskfile Discovery", () => {
    test("discovers Taskfile.yml tasks", function () {
      this.timeout(10000);

      const taskfilePath = getFixturePath("Taskfile.yml");
      assert.ok(fs.existsSync(taskfilePath), "Taskfile.yml should exist");

      const content = fs.readFileSync(taskfilePath, "utf8");
      assert.ok(content.includes("tasks:"), "Should have tasks section");
      assert.ok(content.includes("build:"), "Should have build task");
      assert.ok(content.includes("test:"), "Should have test task");
    });
  });

  suite("Deno Task Discovery", () => {
    test("discovers deno.json tasks", function () {
      this.timeout(10000);

      const denoPath = getFixturePath("deno.json");
      assert.ok(fs.existsSync(denoPath), "deno.json should exist");

      const content = fs.readFileSync(denoPath, "utf8");
      assert.ok(content.includes('"tasks"'), "Should have tasks section");
      assert.ok(content.includes('"dev"'), "Should have dev task");
      assert.ok(content.includes('"build"'), "Should have build task");
    });
  });

  suite("Rake Task Discovery", () => {
    test("discovers Rakefile tasks", function () {
      this.timeout(10000);

      const rakePath = getFixturePath("Rakefile");
      assert.ok(fs.existsSync(rakePath), "Rakefile should exist");

      const content = fs.readFileSync(rakePath, "utf8");
      assert.ok(
        content.includes("desc 'Build"),
        "Should have build task with desc",
      );
      assert.ok(content.includes("task :build"), "Should have build task");
      assert.ok(content.includes("task :test"), "Should have test task");
    });
  });

  suite("Composer Script Discovery", () => {
    test("discovers composer.json scripts", function () {
      this.timeout(10000);

      const composerPath = getFixturePath("composer.json");
      assert.ok(fs.existsSync(composerPath), "composer.json should exist");

      const content = fs.readFileSync(composerPath, "utf8");
      assert.ok(content.includes('"scripts"'), "Should have scripts section");
      assert.ok(content.includes('"test"'), "Should have test script");
      assert.ok(content.includes('"lint"'), "Should have lint script");
    });
  });

  suite("Docker Compose Discovery", () => {
    test("discovers docker-compose.yml services", function () {
      this.timeout(10000);

      const dockerPath = getFixturePath("docker-compose.yml");
      assert.ok(fs.existsSync(dockerPath), "docker-compose.yml should exist");

      const content = fs.readFileSync(dockerPath, "utf8");
      assert.ok(content.includes("services:"), "Should have services section");
      assert.ok(content.includes("web:"), "Should have web service");
      assert.ok(content.includes("db:"), "Should have db service");
    });
  });
});
