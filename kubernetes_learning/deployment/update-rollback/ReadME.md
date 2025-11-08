# Rollback and update in kubernetes

## Description

## Step 1
Initial Deployment with NGINX 1.28.0, Deploy the application using a stable NGINX version.
 
Find the apply changes command and verify command below with output
```
* kubectl apply -f deployment-definition_update.yaml
* kubectl describe deployment myapp-deployment
```
### Output

```Name:                   myapp-deployment
Namespace:              default
CreationTimestamp:      Sat, 08 Nov 2025 18:51:30 +0000
Labels:                 app=myapp
                        type=frontend
Annotations:            deployment.kubernetes.io/revision: 3
Selector:               app=myapp,tier=frontend
Replicas:               3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
Pod Template:
  Labels:  app=myapp
           tier=frontend
  Containers:
   nginx-container:
    Image:         nginx:1.28.0
    Port:          <none>
    Host Port:     <none>
    Environment:   <none>
    Mounts:        <none>
  Volumes:         <none>
  Node-Selectors:  <none>
  Tolerations:     <none>
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable
OldReplicaSets:  myapp-deployment-95d57d964 (0/0 replicas created), myapp-deployment-5594d57d97 (0/0 replicas created)
NewReplicaSet:   myapp-deployment-7fc9454559 (3/3 replicas created)
Events:
  Type    Reason             Age    From                   Message
  ----    ------             ----   ----                   -------
  Normal  ScalingReplicaSet  10m    deployment-controller  Scaled up replica set myapp-deployment-95d57d964 from 0 to 3
  Normal  ScalingReplicaSet  6m37s  deployment-controller  Scaled up replica set myapp-deployment-5594d57d97 from 0 to 1
  Normal  ScalingReplicaSet  3m40s  deployment-controller  Scaled down replica set myapp-deployment-5594d57d97 from 1 to 0
  Normal  ScalingReplicaSet  3m40s  deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 0 to 1
  Normal  ScalingReplicaSet  3m12s  deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 3 to 2
  Normal  ScalingReplicaSet  3m12s  deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 1 to 2
  Normal  ScalingReplicaSet  3m7s   deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 2 to 1
  Normal  ScalingReplicaSet  3m7s   deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 2 to 3
  Normal  ScalingReplicaSet  3m2s   deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 1 to 0

```

## Step 2

* updating nginx version t 1.29.3
   by Update version in yaml file inside template section >  spec >  containers > image
```
template:
    metadata:
      name: myapp-pod
      labels:
        app: myapp
        tier: frontend
    spec:
      containers:
        - name: nginx-container
          image: nginx:1.29.3
```

#### Command Used :
 ```
kubectl apply -f deployment-definition_update.yaml
kubectl describe deployment myapp-deployment
```
### Output

```Name:                   myapp-deployment
Namespace:              default
CreationTimestamp:      Sat, 08 Nov 2025 18:51:30 +0000
Labels:                 app=myapp
                        type=frontend
Annotations:            deployment.kubernetes.io/revision: 4
Selector:               app=myapp,tier=frontend
Replicas:               3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
Pod Template:
  Labels:  app=myapp
           tier=frontend
  Containers:
   nginx-container:
    Image:         nginx:1.29.3
    Port:          <none>
    Host Port:     <none>
    Environment:   <none>
    Mounts:        <none>
  Volumes:         <none>
  Node-Selectors:  <none>
  Tolerations:     <none>
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable
OldReplicaSets:  myapp-deployment-95d57d964 (0/0 replicas created), myapp-deployment-5594d57d97 (0/0 replicas created), myapp-deployment-7fc9454559 (0/0 replicas created)
NewReplicaSet:   myapp-deployment-b849bb557 (3/3 replicas created)
Events:
  Type    Reason             Age                 From                   Message
  ----    ------             ----                ----                   -------
  Normal  ScalingReplicaSet  12m                 deployment-controller  Scaled up replica set myapp-deployment-95d57d964 from 0 to 3
  Normal  ScalingReplicaSet  9m13s               deployment-controller  Scaled up replica set myapp-deployment-5594d57d97 from 0 to 1
  Normal  ScalingReplicaSet  6m16s               deployment-controller  Scaled down replica set myapp-deployment-5594d57d97 from 1 to 0
  Normal  ScalingReplicaSet  6m16s               deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 0 to 1
  Normal  ScalingReplicaSet  5m48s               deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 3 to 2
  Normal  ScalingReplicaSet  5m48s               deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 1 to 2
  Normal  ScalingReplicaSet  5m43s               deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 2 to 1
  Normal  ScalingReplicaSet  5m43s               deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 2 to 3
  Normal  ScalingReplicaSet  5m38s               deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 1 to 0
  Normal  ScalingReplicaSet  87s (x6 over 103s)  deployment-controller  (combined from similar events): Scaled down replica set myapp-deployment-7fc9454559 from 1 to 0

```

## Step 3
#### Undo the changes  and again back to older version 1

#### Commands 
```
kubectl rollout undo deployment myapp-deployment deployment.apps/myapp-deployment rolled back
Verify the undo version :     kubectl describe deployments/myapp-deployment
```

### Output

```
kubectl describe deployments/myapp-deployment

Name:                   myapp-deployment
Namespace:              default
CreationTimestamp:      Sat, 08 Nov 2025 18:51:30 +0000
Labels:                 app=myapp
                        type=frontend
Annotations:            deployment.kubernetes.io/revision: 5
Selector:               app=myapp,tier=frontend
Replicas:               3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
Pod Template:
  Labels:  app=myapp
           tier=frontend
  Containers:
   nginx-container:
    Image:         nginx:1.28.0
    Port:          <none>
    Host Port:     <none>
    Environment:   <none>
    Mounts:        <none>
  Volumes:         <none>
  Node-Selectors:  <none>
  Tolerations:     <none>
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable
OldReplicaSets:  myapp-deployment-95d57d964 (0/0 replicas created), myapp-deployment-5594d57d97 (0/0 replicas created), myapp-deployment-b849bb557 (0/0 replicas created)
NewReplicaSet:   myapp-deployment-7fc9454559 (3/3 replicas created)
Events:
  Type    Reason             Age                 From                   Message
  ----    ------             ----                ----                   -------
  Normal  ScalingReplicaSet  30m                 deployment-controller  Scaled up replica set myapp-deployment-95d57d964 from 0 to 3
  Normal  ScalingReplicaSet  26m                 deployment-controller  Scaled up replica set myapp-deployment-5594d57d97 from 0 to 1
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled down replica set myapp-deployment-5594d57d97 from 1 to 0
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 0 to 1
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 3 to 2
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 1 to 2
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 2 to 1
  Normal  ScalingReplicaSet  23m                 deployment-controller  Scaled down replica set myapp-deployment-95d57d964 from 1 to 0
  Normal  ScalingReplicaSet  15m (x2 over 23m)   deployment-controller  Scaled up replica set myapp-deployment-7fc9454559 from 2 to 3
  Normal  ScalingReplicaSet  15m (x11 over 19m)  deployment-controller  (combined from similar events): Scaled down replica set myapp-deployment-b849bb557 from 1 to 0
```
