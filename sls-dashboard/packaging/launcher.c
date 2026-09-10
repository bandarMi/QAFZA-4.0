/*
 * SLS Dashboard — portable Windows launcher.
 *
 * Runs the bundled Node runtime against the bundled app, waits for the server to
 * report which port it bound, then opens the browser. Everything lives inside this
 * folder: nothing is installed, nothing is written outside it, no registry keys,
 * no PATH changes and no administrator rights — which is the whole point, since
 * the machines this has to run on will not hand out UAC elevation.
 *
 * Build (from Linux):
 *   x86_64-w64-mingw32-gcc -O2 -s -o "SLS Dashboard.exe" launcher.c -lshell32
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>

#define PORT_WAIT_MS 90000   /* generous: the very first run seeds the database */
#define POLL_MS 250

static void die(const char *msg) {
    printf("\n  ERROR: %s\n\n  Press Enter to close this window.\n", msg);
    getchar();
    ExitProcess(1);
}

/* Directory this .exe lives in, without the trailing backslash. */
static void exe_dir(char *out, DWORD n) {
    GetModuleFileNameA(NULL, out, n);
    char *slash = strrchr(out, '\\');
    if (slash) *slash = '\0';
}

int main(void) {
    char dir[MAX_PATH];
    exe_dir(dir, MAX_PATH);

    SetConsoleTitleA("SLS Dashboard");
    printf("\n");
    printf("  Saudi Leadership Society - Data Center\n");
    printf("  =====================================\n\n");
    printf("  Starting... the dashboard will open in your browser.\n");
    printf("  Keep this window open while you use it. Close it to stop.\n\n");

    char node[MAX_PATH], entry[MAX_PATH], portfile[MAX_PATH];
    snprintf(node,     MAX_PATH, "%s\\runtime\\node.exe", dir);
    snprintf(entry,    MAX_PATH, "%s\\app\\server\\dist\\index.js", dir);
    snprintf(portfile, MAX_PATH, "%s\\app\\server\\data\\.port", dir);

    if (GetFileAttributesA(node) == INVALID_FILE_ATTRIBUTES)
        die("runtime\\node.exe is missing. Extract the whole ZIP, keeping its folders together.");
    if (GetFileAttributesA(entry) == INVALID_FILE_ATTRIBUTES)
        die("app\\server\\dist\\index.js is missing. Extract the whole ZIP, keeping its folders together.");

    /* A stale port file from a previous run would send us to the wrong URL. */
    DeleteFileA(portfile);

    char cmd[MAX_PATH * 2 + 8];
    snprintf(cmd, sizeof(cmd), "\"%s\" \"%s\"", node, entry);

    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi = { 0 };
    if (!CreateProcessA(NULL, cmd, NULL, NULL, TRUE, 0, NULL, dir, &si, &pi))
        die("Could not start the bundled Node runtime.");

    /* Wait for the server to publish the port it actually bound. */
    int waited = 0, port = 0;
    while (waited < PORT_WAIT_MS) {
        if (WaitForSingleObject(pi.hProcess, 0) == WAIT_OBJECT_0) {
            DWORD code = 1;
            GetExitCodeProcess(pi.hProcess, &code);
            printf("\n  The server stopped unexpectedly (exit code %lu).\n", code);
            printf("  The lines above usually say why.\n\n  Press Enter to close this window.\n");
            getchar();
            return (int) code;
        }
        FILE *f = fopen(portfile, "r");
        if (f) {
            if (fscanf(f, "%d", &port) != 1) port = 0;
            fclose(f);
            if (port > 0) break;
        }
        Sleep(POLL_MS);
        waited += POLL_MS;
    }

    if (port > 0) {
        char url[64];
        snprintf(url, sizeof(url), "http://localhost:%d", port);
        printf("  Opening %s\n\n", url);
        ShellExecuteA(NULL, "open", url, NULL, NULL, SW_SHOWNORMAL);
    } else {
        printf("  The server did not report a port in time.\n");
        printf("  Try opening http://localhost:4317 manually.\n\n");
    }

    /* Hold the window open for as long as the server runs. */
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    printf("\n  The dashboard has stopped. Press Enter to close this window.\n");
    getchar();
    return 0;
}
